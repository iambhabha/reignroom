import type { RoomState } from "@reignroom/protocol";
import type { RoomConnection, SignalMsg } from "../room-connection.ts";
import { fetchIce, type IceConfig } from "./ice.ts";
import { guestStats, type GuestStats } from "./stats.ts";
import { candidateFromWire, candidateToWire } from "./wire.ts";

export type GuestPhase = "idle" | "connecting" | "playing" | "reconnecting";

export interface GuestSnapshot {
  phase: GuestPhase;
  stream: MediaStream | null;
  stats: GuestStats | null;
  relay: IceConfig["relay"] | null;
}

/** Recovery thresholds: ask the host for a fresh offer only on clear evidence of trouble. */
const FROZEN_MS = 5000; // playing, then no new frames for this long
const DISCONNECTED_MS = 3000; // ICE "disconnected" that doesn't recover
const FIRST_FRAME_MS = 10_000; // offer received but no picture at all
const ASK_INTERVAL_MS = 5000;
const ICE_REFRESH_MS = 50 * 60 * 1000;

/**
 * Guest side of the stream: answers the host's offers, plays the video, and asks for a
 * fresh connection when it breaks (auto-reconnect).
 */
export class GuestStream {
  private pc: RTCPeerConnection | null = null;
  private pcCreatedAt = 0;
  private disconnectedSince: number | null = null;
  /** Candidates that arrive before the offer has been applied. */
  private pendingIce: RTCIceCandidateInit[] = [];
  private ice: (IceConfig & { at: number }) | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private host: string | null = null;
  private hostOnline = false;
  private live = false;
  private lastProgress = 0;
  private lastFrames = 0;
  private lastAsk = 0;
  private snap: GuestSnapshot = { phase: "idle", stream: null, stats: null, relay: null };

  constructor(
    private readonly conn: RoomConnection,
    private readonly code: string,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  /** Starts listening and watching the stream; the returned function tears it all down. */
  attach(): () => void {
    const off = this.conn.onSignal((m) => void this.onSignal(m));
    this.timer = setInterval(() => void this.tick(), 1000);
    return () => {
      off();
      clearInterval(this.timer);
      this.live = false;
      this.closePc();
      this.update({ phase: "idle", stream: null, stats: null });
    };
  }

  syncRoom(room: RoomState): void {
    const host = room.members.find((m) => m.host);
    this.host = host?.peer ?? null;
    this.hostOnline = host?.online ?? false;
    // While the host's socket is down, keep whatever video is playing: the media path is
    // peer to peer and often survives a signaling hiccup. Act only on what an online host says.
    if (!this.hostOnline) return;
    if (!room.live) {
      if (this.live || this.pc) {
        this.live = false;
        this.closePc();
        this.update({ phase: "idle", stream: null, stats: null });
      }
      return;
    }
    if (!this.live) {
      this.live = true;
      this.lastAsk = Date.now(); // the host offers on its own when it starts; don't ask yet
      void this.loadIce();
      if (!this.pc) this.update({ phase: "connecting" });
    }
  }

  private async loadIce(): Promise<IceConfig> {
    if (!this.ice || Date.now() - this.ice.at > ICE_REFRESH_MS) {
      this.ice = { ...(await fetchIce(this.code)), at: Date.now() };
      this.update({ relay: this.ice.relay });
    }
    return this.ice;
  }

  private async onSignal(msg: SignalMsg): Promise<void> {
    if (msg.from !== this.host) return;
    if (msg.t === "sdp" && msg.kind === "offer") {
      await this.answer(msg.sdp);
    } else if (msg.t === "ice") {
      const cand = msg.cand ? candidateFromWire(msg.cand) : undefined;
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(cand).catch(() => {});
      else if (cand) this.pendingIce.push(cand);
    }
  }

  private async answer(sdp: string): Promise<void> {
    // The room relays in order: candidates queued before this offer belong to an older one.
    this.pendingIce = [];
    const ice = await this.loadIce();
    this.closePc();
    const pc = new RTCPeerConnection({ iceServers: ice.servers });
    this.pc = pc;
    this.pcCreatedAt = Date.now();
    this.disconnectedSince = null;
    this.lastFrames = 0;
    this.update({ phase: this.snap.stream ? "reconnecting" : "connecting" });

    pc.ontrack = (e) => {
      // Lowest possible playout delay; the browser still adapts to network jitter.
      const receiver = e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null };
      if ("jitterBufferTarget" in receiver) receiver.jitterBufferTarget = 0;
      this.update({ stream: e.streams[0] ?? new MediaStream([e.track]) });
    };
    pc.onicecandidate = (e) => {
      if (this.host) this.conn.send({ t: "ice", to: this.host, cand: candidateToWire(e.candidate) });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      this.disconnectedSince = pc.connectionState === "disconnected" ? Date.now() : null;
    };

    try {
      await pc.setRemoteDescription({ type: "offer", sdp });
      for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      await pc.setLocalDescription(await pc.createAnswer());
    } catch {
      return; // A newer offer replaced this one mid-way.
    }
    if (this.host && this.pc === pc) {
      this.conn.send({ t: "sdp", to: this.host, kind: "answer", sdp: pc.localDescription!.sdp });
    }
  }

  /** Once a second: refresh stats and recover from a missing, broken or frozen picture. */
  private async tick(): Promise<void> {
    if (!this.live || !this.host || !this.hostOnline) return;
    const now = Date.now();
    const pc = this.pc;
    if (pc) {
      try {
        const stats = await guestStats(pc);
        if (stats.framesDecoded > this.lastFrames) {
          this.lastFrames = stats.framesDecoded;
          this.lastProgress = now;
          if (this.snap.phase !== "playing") this.update({ phase: "playing" });
        }
        this.update({ stats });
      } catch {
        // Closed while sampling.
      }
    }

    const state = pc?.connectionState;
    const needsOffer =
      !pc ||
      state === "failed" ||
      state === "closed" ||
      (this.disconnectedSince !== null && now - this.disconnectedSince > DISCONNECTED_MS) ||
      (this.lastFrames > 0 && now - this.lastProgress > FROZEN_MS) ||
      (this.lastFrames === 0 && now - this.pcCreatedAt > FIRST_FRAME_MS);
    if (needsOffer && now - this.lastAsk > ASK_INTERVAL_MS) {
      this.lastAsk = now;
      if (this.snap.phase === "playing") this.update({ phase: "reconnecting" });
      this.conn.send({ t: "want-offer", to: this.host });
    }
  }

  private closePc(): void {
    this.pc?.close();
    this.pc = null;
  }

  private update(patch: Partial<GuestSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}
