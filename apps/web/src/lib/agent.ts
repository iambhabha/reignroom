import {
  AGENT_PROTOCOL,
  AGENT_URL,
  FromAgent,
  PairingToken,
  type AgentStatus,
  type PadState,
  type Slot,
  type ToAgent,
} from "@reignroom/protocol";

export type BridgeState =
  | "off" // no token yet
  | "connecting"
  | "paired"
  | "unreachable" // agent not running, or the browser blocked local access
  | "bad_token"
  | "replaced"; // another tab paired with the agent

export interface BridgeSnapshot {
  state: BridgeState;
  status: AgentStatus | null;
  token: string | null;
  /** Pads the agent said it has no controller for. */
  missingPads: Slot[];
}

const TOKEN_KEY = "rr:agent-token";
const RETRY_MS = 3000;

function readToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && PairingToken.safeParse(t).success ? t : null;
  } catch {
    return null;
  }
}

function writeToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not remembered; works for this page load.
  }
}

/**
 * The host page's connection to the ReignRoom agent on this computer (ws://127.0.0.1).
 * Event-driven, so it keeps forwarding input while the tab is in the background.
 */
export class AgentBridge {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private ackListeners = new Set<(pad: Slot, seq: number) => void>();
  private retry: ReturnType<typeof setTimeout> | undefined;
  private wanted = false;
  private lastPad: Slot | null = null;
  private snap: BridgeSnapshot = { state: "off", status: null, token: readToken(), missingPads: [] };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  onAck(fn: (pad: Slot, seq: number) => void): () => void {
    this.ackListeners.add(fn);
    return () => this.ackListeners.delete(fn);
  }

  get paired(): boolean {
    return this.snap.state === "paired";
  }

  /** Connects with the saved token, if there is one. */
  attach(): () => void {
    if (this.snap.token) this.start();
    return () => this.stop();
  }

  pair(token: string): boolean {
    const clean = token.trim();
    if (!PairingToken.safeParse(clean).success) return false;
    writeToken(clean);
    this.update({ token: clean });
    this.stop();
    this.start();
    return true;
  }

  forget(): void {
    this.stop();
    writeToken(null);
    this.update({ token: null, state: "off", status: null });
  }

  sendPad(pad: Slot, seq: number, state: PadState): void {
    this.lastPad = pad;
    this.send({ t: "pad", pad, seq, ...state });
  }

  release(pad: Slot): void {
    this.send({ t: "release", pad });
  }

  private send(msg: ToAgent): void {
    if (this.snap.state === "paired" && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private start(): void {
    const token = this.snap.token;
    if (!token) return;
    this.wanted = true;
    clearTimeout(this.retry);
    this.update({ state: "connecting" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(AGENT_URL);
    } catch {
      this.update({ state: "unreachable" });
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: "auth", v: AGENT_PROTOCOL, token } satisfies ToAgent));
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let parsed;
      try {
        parsed = FromAgent.safeParse(JSON.parse(e.data));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.t === "ready") this.update({ state: "paired", missingPads: [] });
      else if (msg.t === "status") this.update({ status: msg });
      else if (msg.t === "ack") for (const fn of this.ackListeners) fn(msg.pad, msg.seq);
      else if (msg.code === "bad_token") this.end("bad_token");
      else if (msg.code === "replaced") this.end("replaced");
      else if (msg.code === "pad_unavailable" && this.lastPad) this.notePadMissing(this.lastPad);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wanted) return;
      if (this.snap.state === "bad_token" || this.snap.state === "replaced") return;
      // Agent not started yet, closed, or the browser blocked it: keep trying quietly.
      this.update({ state: "unreachable", status: null });
      this.retry = setTimeout(() => this.start(), RETRY_MS);
    };
  }

  /** Records that the agent has no virtual controller for this slot. */
  notePadMissing(pad: Slot): void {
    if (!this.snap.missingPads.includes(pad)) this.update({ missingPads: [...this.snap.missingPads, pad] });
  }

  private end(state: "bad_token" | "replaced"): void {
    this.wanted = false;
    this.update({ state, status: null });
    this.ws?.close();
  }

  private stop(): void {
    this.wanted = false;
    clearTimeout(this.retry);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private update(patch: Partial<BridgeSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}
