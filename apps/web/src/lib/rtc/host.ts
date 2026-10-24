import { GuestInput, type HostToGuest, type RoomState, type Slot } from "@reignroom/protocol";
import type { PadBridge } from "../pad-bridge.ts";
import type { RoomConnection, SignalMsg } from "../room-connection.ts";
import { candidateFromWire, candidateToWire } from "./wire.ts";
import { fetchIce, type IceConfig } from "./ice.ts";
import { DEFAULT_QUALITY, type Quality } from "./quality.ts";
import { hostStats, type HostPeerStats } from "./stats.ts";
import { startTestPattern } from "./test-pattern.ts";
import { applyQuality, encodingFor, preferCodecs } from "./tuning.ts";

export type Source = "window" | "screen" | "test" | "emulator" | "netplay";

export type PeerPhase = "connecting" | "connected" | "failed";

export interface HostSnapshot {
  live: boolean;
  starting: boolean;
  source: Source | null;
  /** What the person actually picked in the browser's share dialog. */
  surface: "monitor" | "window" | "browser" | "test" | "emulator" | "netplay" | null;
  hasAudio: boolean;
  quality: Quality;
  preview: MediaStream | null;
  error: string | null;
  peers: Record<string, { phase: PeerPhase; stats: HostPeerStats | null }>;
  /** Netplay source: each guest's "netplay" data channel, by peer id. */
  netplay: Record<string, RTCDataChannel>;
}

interface Peer {
  pc: RTCPeerConnection;
  /** Guest → host controller input; host → guest acks. Unordered, never retransmitted. */
  input: RTCDataChannel;
  createdAt: number;
  pendingIce: RTCIceCandidateInit[];
  sample: { bytes: number; at: number } | null;
  retry?: ReturnType<typeof setTimeout>;
}

/** Acks the agent hasn't answered within this time are forgotten. */
const PENDING_INPUT_MS = 2000;

/** A fresh offer is not sent again for the same guest within this window. */
const OFFER_DEBOUNCE_MS = 3000;
/** TURN credentials last 2 hours; refresh well before that for new connections. */
const ICE_REFRESH_MS = 50 * 60 * 1000;

/**
 * Host side of the stream: captures the game, and keeps one peer connection per guest
 * (mesh, host → up to 3 guests). Event-driven so it keeps working in a background tab.
 */
export class HostStream {
  private peers = new Map<string, Peer>();
  private listeners = new Set<() => void>();
  private stopSource: (() => void) | null = null;
  private ice: IceConfig | null = null;
  private guests = new Set<string>();
  /** Player slot each guest drives, from the room state. */
  private slots = new Map<string, Slot>();
  /** "slot:seq" → who sent it and their timestamp, until the agent acks it. */
  private pending = new Map<string, { peer: string; ts: number; at: number }>();
  private statsTimer: ReturnType<typeof setInterval> | undefined;
  private iceTimer: ReturnType<typeof setInterval> | undefined;
  private snap: HostSnapshot = {
    live: false,
    starting: false,
    source: null,
    surface: null,
    hasAudio: false,
    quality: DEFAULT_QUALITY,
    preview: null,
    error: null,
    peers: {},
    netplay: {},
  };

  constructor(
    private readonly conn: RoomConnection,
    private readonly code: string,
    private readonly bridge: PadBridge,
  ) {}

  /** Starts listening for signaling and agent acks; the returned function stops everything. */
  attach(): () => void {
    const offSignal = this.conn.onSignal((m) => void this.onSignal(m));
    const offAck = this.bridge.onAck((pad, seq) => this.onAgentAck(pad, seq));
    let wasPaired = this.bridge.paired;
    const offBridge = this.bridge.subscribe(() => {
      if (this.bridge.paired === wasPaired) return;
      wasPaired = this.bridge.paired;
      for (const peerId of this.peers.keys()) this.tellBridge(peerId);
    });
    return () => {
      offSignal();
      offAck();
      offBridge();
      this.stop();
    };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  /** `given` is the stream for the "emulator" source (the in-browser emulator's canvas). */
  async start(source: Source, given?: MediaStream): Promise<void> {
    if (this.snap.live || this.snap.starting) return;
    this.update({ starting: true, error: null });
    let stream: MediaStream;
    try {
      if (source === "test") {
        const pattern = startTestPattern();
        stream = pattern.stream;
        this.stopSource = pattern.stop;
      } else if (source === "netplay") {
        // No media: both players run the game themselves; only input crosses the network.
        stream = new MediaStream();
        this.stopSource = null;
      } else if (source === "emulator") {
        if (!given) throw new Error("no emulator stream");
        stream = given;
        // The emulator keeps running; only this capture of its canvas ends.
        this.stopSource = () => stream.getTracks().forEach((t) => t.stop());
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia(captureOptions(source));
        this.stopSource = () => stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      this.update({ starting: false, error: captureError(err) });
      return;
    }
    this.ice = await fetchIce(this.code);

    const video = stream.getVideoTracks()[0];
    if (!video && source !== "netplay") {
      this.stopSource?.();
      this.update({ starting: false, error: "No video was shared. Try again and pick the PCSX2 window." });
      return;
    }
    if (video) {
      video.contentHint = "motion";
      // The person pressed the browser's own "Stop sharing" button.
      video.addEventListener("ended", () => this.stop());
    }

    const surface =
      source === "test" || source === "emulator" || source === "netplay"
        ? source
        : ((video?.getSettings().displaySurface as HostSnapshot["surface"]) ?? null);
    this.update({
      live: true,
      starting: false,
      source,
      surface,
      hasAudio: stream.getAudioTracks().length > 0,
      preview: stream,
    });
    this.conn.send({ t: "stream", live: true });
    this.statsTimer = setInterval(() => void this.sampleStats(), 1000);
    this.iceTimer = setInterval(async () => {
      this.ice = await fetchIce(this.code);
    }, ICE_REFRESH_MS);
    for (const guest of this.guests) void this.connect(guest);
  }

  stop(): void {
    if (!this.snap.live) return;
    clearInterval(this.statsTimer);
    clearInterval(this.iceTimer);
    for (const peer of [...this.peers.keys()]) this.closePeer(peer);
    this.stopSource?.();
    this.stopSource = null;
    this.conn.send({ t: "stream", live: false });
    this.update({ live: false, source: null, surface: null, hasAudio: false, preview: null, peers: {}, netplay: {} });
  }

  setQuality(quality: Quality): void {
    this.update({ quality });
    const height = this.sourceHeight();
    for (const { pc } of this.peers.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track?.kind === "video") void applyQuality(sender, quality, height);
      }
    }
  }

  /** Called with every room update: connects to guests who arrive, drops those who leave. */
  syncRoom(room: RoomState): void {
    // The room marks the stream stopped when the host's socket drops; after a reconnect,
    // say again that it is live. (Guests' video keeps flowing meanwhile: media is peer to peer.)
    if (this.snap.live && !room.live) this.conn.send({ t: "stream", live: true });
    const online = new Set(room.members.filter((m) => !m.host && m.online).map((m) => m.peer));
    for (const peer of online) {
      // A guest who comes back (reload, new socket) needs a brand-new connection.
      if (!this.guests.has(peer) && this.snap.live) void this.connect(peer);
    }
    for (const peer of this.guests) if (!online.has(peer)) this.closePeer(peer);
    this.guests = online;

    // Slot changes: release the old virtual pad so nothing stays held, and tell the guest.
    const slots = new Map<string, Slot>();
    for (const m of room.members) if (!m.host && m.online && m.slot !== null) slots.set(m.peer, m.slot);
    for (const [peer, slot] of this.slots) {
      if (slots.get(peer) !== slot) this.bridge.release(slot);
    }
    const changed = [...new Set([...this.slots.keys(), ...slots.keys()])].filter(
      (p) => this.slots.get(p) !== slots.get(p),
    );
    this.slots = slots;
    for (const peer of changed) this.tellBridge(peer);
  }

  /** Forwards one guest input message to the agent, if it is valid and the guest has a slot. */
  private onInput(peerId: string, raw: unknown): void {
    if (typeof raw !== "string" || raw.length > 512) return;
    let parsed;
    try {
      parsed = GuestInput.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success || !this.bridge.paired) return;
    const slot = this.slots.get(peerId);
    if (!slot) return;
    const { seq, ts, t: _t, ...state } = parsed.data;
    this.pending.set(`${slot}:${seq}`, { peer: peerId, ts, at: performance.now() });
    this.bridge.sendPad(slot, seq, state);
  }

  private onAgentAck(pad: Slot, seq: number): void {
    const key = `${pad}:${seq}`;
    const entry = this.pending.get(key);
    if (!entry) return;
    this.pending.delete(key);
    this.sendToGuest(entry.peer, { t: "ack", seq, ts: entry.ts });
  }

  private tellBridge(peerId: string): void {
    const slot = this.slots.get(peerId) ?? null;
    this.sendToGuest(peerId, { t: "bridge", ok: this.bridge.paired && (slot === null || this.bridge.accepts(slot)), pad: slot });
  }

  private sendToGuest(peerId: string, msg: HostToGuest): void {
    const dc = this.peers.get(peerId)?.input;
    if (dc?.readyState === "open") dc.send(JSON.stringify(msg));
  }

  private sourceHeight(): number | undefined {
    return this.snap.preview?.getVideoTracks()[0]?.getSettings().height;
  }

  /** Builds a new connection to one guest. Everything up to the offer is synchronous, so a
   *  second request for the same guest always sees this one and is debounced. */
  private async connect(peerId: string): Promise<void> {
    const stream = this.snap.preview;
    if (!stream || !this.ice) return;
    this.closePeer(peerId);
    const pc = new RTCPeerConnection({ iceServers: this.ice.servers });
    const input = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
    input.onopen = () => this.tellBridge(peerId);
    input.onmessage = (e) => this.onInput(peerId, e.data);
    const peer: Peer = { pc, input, createdAt: Date.now(), pendingIce: [], sample: null };
    this.peers.set(peerId, peer);
    if (this.snap.source === "netplay") {
      const netplay = pc.createDataChannel("netplay", { ordered: true });
      this.update({ netplay: { ...this.snap.netplay, [peerId]: netplay } });
    }
    this.setPeer(peerId, { phase: "connecting", stats: null });

    const height = this.sourceHeight();
    for (const track of stream.getTracks()) {
      const transceiver = pc.addTransceiver(track, {
        direction: "sendonly",
        streams: [stream],
        ...(track.kind === "video" ? { sendEncodings: [encodingFor(this.snap.quality, height)] } : {}),
      });
      if (track.kind === "video") preferCodecs(transceiver);
    }

    pc.onicecandidate = (e) =>
      this.conn.send({ t: "ice", to: peerId, cand: candidateToWire(e.candidate) });
    pc.onconnectionstatechange = () => {
      if (this.peers.get(peerId)?.pc !== pc) return;
      const state = pc.connectionState;
      if (state === "connected") {
        this.setPeer(peerId, { phase: "connected" });
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === "video") void applyQuality(sender, this.snap.quality, this.sourceHeight());
        }
      } else if (state === "failed") {
        this.setPeer(peerId, { phase: "failed" });
        // Try once more from scratch; the guest also asks for a new offer if it stays broken.
        peer.retry = setTimeout(() => {
          if (this.guests.has(peerId) && this.snap.live) void this.connect(peerId);
        }, 2000);
      }
    };

    await pc.setLocalDescription(await pc.createOffer());
    this.conn.send({ t: "sdp", to: peerId, kind: "offer", sdp: pc.localDescription!.sdp });
  }

  private async onSignal(msg: SignalMsg): Promise<void> {
    if (msg.t === "want-offer") {
      const existing = this.peers.get(msg.from);
      const fresh = existing && Date.now() - existing.createdAt < OFFER_DEBOUNCE_MS;
      if (this.snap.live && this.guests.has(msg.from) && !fresh) await this.connect(msg.from);
      return;
    }
    const peer = this.peers.get(msg.from);
    if (!peer) return;
    if (msg.t === "sdp" && msg.kind === "answer") {
      await peer.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp }).catch(() => {});
      for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => {});
    } else if (msg.t === "ice") {
      const cand = msg.cand ? candidateFromWire(msg.cand) : undefined;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(cand).catch(() => {});
      else if (cand) peer.pendingIce.push(cand);
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    clearTimeout(peer.retry);
    peer.pc.close();
    this.peers.delete(peerId);
    const slot = this.slots.get(peerId);
    if (slot) this.bridge.release(slot);
    const { [peerId]: _, ...rest } = this.snap.peers;
    const { [peerId]: _np, ...netplay } = this.snap.netplay;
    this.update({ peers: rest, netplay });
  }

  private async sampleStats(): Promise<void> {
    const now = performance.now();
    for (const [key, p] of this.pending) if (now - p.at > PENDING_INPUT_MS) this.pending.delete(key);
    for (const [peerId, peer] of this.peers) {
      try {
        const { stats, sample } = await hostStats(peer.pc, peer.sample);
        peer.sample = sample;
        if (this.peers.get(peerId) === peer) this.setPeer(peerId, { stats });
      } catch {
        // Connection closed mid-sample.
      }
    }
  }

  private setPeer(peerId: string, patch: Partial<HostSnapshot["peers"][string]>): void {
    const prev = this.snap.peers[peerId] ?? { phase: "connecting" as const, stats: null };
    this.update({ peers: { ...this.snap.peers, [peerId]: { ...prev, ...patch } } });
  }

  private update(patch: Partial<HostSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}

/** getDisplayMedia options. Chrome-specific hints are ignored by browsers that lack them. */
function captureOptions(source: "window" | "screen"): DisplayMediaStreamOptions {
  const video: MediaTrackConstraints & { displaySurface?: string } = {
    frameRate: { ideal: 60, max: 60 },
    displaySurface: source === "screen" ? "monitor" : "window",
  };
  return {
    video,
    audio: source === "screen",
    // Non-standard but widely supported hints (Chrome/Edge).
    ...({
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      systemAudio: source === "screen" ? "include" : "exclude",
      monitorTypeSurfaces: "include",
    } as object),
  };
}

function captureError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Sharing was cancelled or blocked. Press Start streaming and pick the PCSX2 window.";
  if (name === "NotSupportedError" || !navigator.mediaDevices?.getDisplayMedia) {
    return "This browser can't share a window. Use Chrome or Edge on Windows to host.";
  }
  return "Couldn't start sharing. Try again, or use the test pattern to check your connection.";
}
