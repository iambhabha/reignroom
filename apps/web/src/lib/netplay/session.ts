import { NETPLAY_DELAY_MAX, NETPLAY_DELAY_MIN, NETPLAY_VERSION, NetplayMsg } from "@reignroom/protocol";
import type { BrowserEmulator, PlayPad } from "../emu/emulator.ts";
import { delayForRtt, Lockstep } from "./lockstep.ts";

export type NetplayPhase =
  | "connecting" // data channel not open yet
  | "setup" // choosing discs
  | "running"
  | "ended"; // the other player left or the connection broke

export interface DiscInfo {
  id: string;
  name: string;
}

export interface NetplaySnapshot {
  phase: NetplayPhase;
  myDisc: DiscInfo | null;
  peerDisc: DiscInfo | null;
  /** The other player sent a hello with the same netplay version. */
  peerReady: boolean;
  rttMs: number | null;
  delay: number | null;
  waiting: boolean;
  waitedMs: number;
  desyncFrame: number | null;
  error: string | null;
}

const PING_MS = 1000;
const RTT_SAMPLES = 10;

/**
 * One netplay match between the host (P1) and one guest (P2) over a "netplay" data channel.
 * Both pick their own disc image; the host starts; both emulators then run in lockstep.
 */
export class NetplaySession {
  private listeners = new Set<() => void>();
  private file: File | null = null;
  private lockstep: Lockstep | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private ticker: Worker | null = null;
  private rtts: number[] = [];
  private snap: NetplaySnapshot = {
    phase: "connecting",
    myDisc: null,
    peerDisc: null,
    peerReady: false,
    rttMs: null,
    delay: null,
    waiting: false,
    waitedMs: 0,
    desyncFrame: null,
    error: null,
  };

  constructor(
    readonly role: "host" | "guest",
    private readonly channel: RTCDataChannel,
    private readonly emulator: BrowserEmulator,
    private readonly readInput: () => PlayPad,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snap;

  attach(): () => void {
    const ch = this.channel;
    const onOpen = () => {
      this.update({ phase: this.snap.phase === "connecting" ? "setup" : this.snap.phase });
      this.send({ t: "hello", v: NETPLAY_VERSION });
      if (this.snap.myDisc) this.send({ t: "disc", ...this.snap.myDisc });
    };
    const onClose = () => this.end("The other player left or the connection dropped.");
    const onMessage = (e: MessageEvent) => this.onMessage(e.data);
    ch.addEventListener("open", onOpen);
    ch.addEventListener("close", onClose);
    ch.addEventListener("message", onMessage);
    if (ch.readyState === "open") onOpen();
    this.timers.push(setInterval(() => this.send({ t: "ping", ts: performance.now() }), PING_MS));
    return () => {
      ch.removeEventListener("open", onOpen);
      ch.removeEventListener("close", onClose);
      ch.removeEventListener("message", onMessage);
      for (const t of this.timers) clearInterval(t);
      this.timers = [];
      this.ticker?.terminate();
      this.ticker = null;
    };
  }

  /** Picks this player's disc image (not started until the host starts the match). */
  async setDisc(file: File): Promise<void> {
    this.file = file;
    const disc = { id: await discFingerprint(file), name: file.name.slice(0, 200) };
    this.update({ myDisc: disc });
    this.send({ t: "disc", ...disc });
  }

  get discsMatch(): boolean {
    return !!this.snap.myDisc && !!this.snap.peerDisc && this.snap.myDisc.id === this.snap.peerDisc.id;
  }

  /** Host only. */
  get canStart(): boolean {
    return (
      this.role === "host" &&
      this.snap.phase === "setup" &&
      this.snap.peerReady &&
      this.discsMatch &&
      this.emulator.getSnapshot().phase === "ready"
    );
  }

  /** Host only: starts both games. */
  start(): void {
    if (!this.canStart) return;
    const delay = delayForRtt(this.snap.rttMs ?? 100, NETPLAY_DELAY_MIN, NETPLAY_DELAY_MAX);
    const clock = Math.floor(Date.now() / 1000);
    this.send({ t: "start", delay, clock });
    this.begin(delay, clock);
  }

  private begin(delay: number, clock: number): void {
    if (!this.file) {
      this.update({ error: "Choose your disc image first." });
      return;
    }
    const error = this.emulator.bootLockstep(this.file, clock);
    if (error) {
      this.update({ error });
      return;
    }
    const lockstep = new Lockstep(this.role, delay, this.emulator, (m) => this.send(m), this.readInput);
    this.lockstep = lockstep;
    this.update({ phase: "running", delay, error: null });
    // Driven by a worker's clock, so the game keeps its speed if this tab is in the background.
    const ticker = new Worker(new URL("./ticker.worker.ts", import.meta.url), { type: "module" });
    this.ticker = ticker;
    ticker.onmessage = () => {
      lockstep.tick();
      if (
        lockstep.waiting !== this.snap.waiting ||
        lockstep.desyncFrame !== this.snap.desyncFrame ||
        Math.abs(lockstep.waitedMs - this.snap.waitedMs) > 250
      ) {
        this.update({ waiting: lockstep.waiting, desyncFrame: lockstep.desyncFrame, waitedMs: lockstep.waitedMs });
      }
    };
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== "string" || raw.length > 1024) return;
    let parsed;
    try {
      parsed = NetplayMsg.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;
    switch (msg.t) {
      case "hello":
        this.update({ peerReady: true });
        break;
      case "disc":
        this.update({ peerDisc: { id: msg.id, name: msg.name } });
        break;
      case "ping":
        this.send({ t: "pong", ts: msg.ts });
        break;
      case "pong": {
        const rtt = performance.now() - msg.ts;
        if (rtt < 0 || rtt > 10_000) break;
        this.rtts.push(rtt);
        if (this.rtts.length > RTT_SAMPLES) this.rtts.shift();
        const sorted = [...this.rtts].sort((a, b) => a - b);
        this.update({ rttMs: Math.round(sorted[Math.floor(sorted.length / 2)]!) });
        break;
      }
      case "start":
        if (this.role === "guest" && this.snap.phase === "setup") this.begin(msg.delay, msg.clock);
        break;
      default:
        this.lockstep?.onMessage(msg);
    }
  }

  private send(msg: NetplayMsg): void {
    if (this.channel.readyState === "open") this.channel.send(JSON.stringify(msg));
  }

  private end(reason: string): void {
    if (this.snap.phase === "ended") return;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.ticker?.terminate();
    this.ticker = null;
    this.update({ phase: "ended", error: reason, waiting: false });
  }

  private update(patch: Partial<NetplaySnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}

/**
 * Identifies a disc image without reading all of it: SHA-256 of its size, first 4 MiB and last
 * 1 MiB. Two copies of the same dump in the same format match; different regions don't.
 */
export async function discFingerprint(file: Blob): Promise<string> {
  const head = await file.slice(0, 4 << 20).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - (1 << 20))).arrayBuffer();
  const size = new TextEncoder().encode(String(file.size));
  const all = new Uint8Array(size.length + head.byteLength + tail.byteLength);
  all.set(size, 0);
  all.set(new Uint8Array(head), size.length);
  all.set(new Uint8Array(tail), size.length + head.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", all));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
