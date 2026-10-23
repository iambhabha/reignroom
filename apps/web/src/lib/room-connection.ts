import {
  PROTOCOL_VERSION,
  ServerMsg,
  type ChatEntry,
  type ClientMsg,
  type ErrorCode,
  type RoomState,
} from "@reignroom/protocol";
import { resumeFor } from "./storage.ts";

export type Status = "connecting" | "open" | "reconnecting" | "closed";

/** Why the connection ended for good. */
export type EndReason = ErrorCode | "kicked" | "replaced" | "connection_lost" | "left";

/** WebRTC signaling relayed by the room. */
export type SignalMsg = Extract<ServerMsg, { t: "sdp" | "ice" | "want-offer" }>;

export interface Notice {
  code: ErrorCode;
  id: number;
}

export interface Snapshot {
  status: Status;
  peer: string | null;
  room: RoomState | null;
  chat: ChatEntry[];
  ended: EndReason | null;
  notice: Notice | null;
}

/** Errors after which reconnecting cannot help. */
const FINAL: ReadonlySet<ErrorCode> = new Set([
  "version_mismatch",
  "room_not_found",
  "room_full",
  "room_locked",
  "name_invalid",
  "name_taken",
  "bad_host_key",
]);

const PING_MS = 25_000;
const MAX_ATTEMPTS = 8;
const CLOSE_REPLACED = 4000;
const CLOSE_KICKED = 4001;

/**
 * One member's socket to a room. Reconnects with backoff and resumes the same seat;
 * exposes an immutable snapshot for React's useSyncExternalStore.
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private signalListeners = new Set<(msg: SignalMsg) => void>();
  private snap: Snapshot = {
    status: "connecting",
    peer: null,
    room: null,
    chat: [],
    ended: null,
    notice: null,
  };
  private attempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeSeq = 0;
  private finalCode: ErrorCode | null = null;

  constructor(
    readonly code: string,
    private readonly name: string,
    private readonly hostKey: string | null,
  ) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  onSignal(fn: (msg: SignalMsg) => void): () => void {
    this.signalListeners.add(fn);
    return () => this.signalListeners.delete(fn);
  }

  start(): void {
    if (this.ws || this.snap.ended) return;
    this.connect();
  }

  send(msg: Exclude<ClientMsg, { t: "hello" }>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Leaves the room for good (frees the seat immediately). */
  leave(): void {
    this.send({ t: "leave" });
    resumeFor.set(this.code, null);
    this.stop("left");
  }

  /** Closes this tab's socket but keeps the seat for a resume (e.g. component unmount). */
  dispose(): void {
    this.stop(null);
  }

  /** Tries again after the connection was lost for good. */
  retry(): void {
    if (this.snap.ended !== "connection_lost") return;
    this.attempts = 0;
    this.update({ ended: null, status: "connecting" });
    this.connect();
  }

  private connect(): void {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/rooms/${this.code}/ws`);
    this.ws = ws;
    this.finalCode = null;

    ws.onopen = () => {
      const resume = resumeFor.get(this.code);
      ws.send(
        JSON.stringify({
          t: "hello",
          v: PROTOCOL_VERSION,
          name: this.name,
          ...(this.hostKey ? { hostKey: this.hostKey } : {}),
          ...(resume ? { resume } : {}),
        } satisfies ClientMsg),
      );
      this.pingTimer = setInterval(() => ws.send("ping"), PING_MS);
    };

    ws.onmessage = (e) => {
      if (e.data === "pong" || typeof e.data !== "string") return;
      let parsed;
      try {
        parsed = ServerMsg.safeParse(JSON.parse(e.data));
      } catch {
        return;
      }
      if (parsed.success) this.handle(parsed.data);
    };

    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.snap.ended) return;
      if (e.code === CLOSE_KICKED) return this.end("kicked");
      if (e.code === CLOSE_REPLACED) return this.end("replaced");
      if (this.finalCode) return this.end(this.finalCode);
      this.scheduleReconnect();
    };
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case "welcome":
        this.attempts = 0;
        resumeFor.set(this.code, msg.resume);
        this.update({ status: "open", peer: msg.peer, room: msg.room, chat: msg.chat });
        return;
      case "state":
        this.update({ room: msg.room });
        return;
      case "chat":
        this.update({ chat: [...this.snap.chat, msg.entry].slice(-200) });
        return;
      case "kicked":
        resumeFor.set(this.code, null);
        this.end("kicked");
        return;
      case "error":
        if (msg.fatal) {
          if (FINAL.has(msg.code)) this.finalCode = msg.code;
          if (msg.code === "bad_message" && !this.snap.peer) this.finalCode = msg.code;
          return;
        }
        this.update({ notice: { code: msg.code, id: ++this.noticeSeq } });
        return;
      case "sdp":
      case "ice":
      case "want-offer":
        for (const fn of this.signalListeners) fn(msg);
        return;
    }
  }

  private scheduleReconnect(): void {
    if (this.attempts >= MAX_ATTEMPTS) return this.end("connection_lost");
    const delay = Math.min(8000, 500 * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
    this.attempts += 1;
    this.update({ status: "reconnecting" });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private end(reason: EndReason): void {
    this.stop(reason);
  }

  private stop(reason: EndReason | null): void {
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000);
    if (reason) this.update({ status: "closed", ended: reason });
  }

  private update(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}
