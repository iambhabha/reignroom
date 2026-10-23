import { exports } from "cloudflare:workers";
import type { CreateRoomRes, PlayerCount, ServerMsg } from "@reignroom/protocol";

const BASE = "https://rr.test";
let ipCounter = 0;

/** Each call uses a fresh client IP so per-IP rate limits don't leak between tests. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

export function api(path: string, init: RequestInit & { ip?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip ?? freshIp());
  return exports.default.fetch(new Request(BASE + path, { ...init, headers }));
}

export async function createRoom(players: PlayerCount = 2): Promise<CreateRoomRes> {
  const res = await api("/api/rooms", { method: "POST", body: JSON.stringify({ players }) });
  if (res.status !== 201) throw new Error(`create failed: ${res.status}`);
  return res.json();
}

type Of<T extends ServerMsg["t"]> = Extract<ServerMsg, { t: T }>;

/** A test client that buffers server messages and lets tests await specific ones. */
export class Client {
  readonly inbox: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  private waiters: Array<() => void> = [];

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      this.inbox.push(JSON.parse(e.data as string) as ServerMsg);
      this.wake();
    });
    ws.addEventListener("close", (e) => {
      this.closed = { code: e.code, reason: e.reason };
      this.wake();
    });
  }

  static async open(code: string, origin?: string): Promise<Client> {
    const headers: Record<string, string> = { Upgrade: "websocket" };
    if (origin) headers.Origin = origin;
    const res = await api(`/api/rooms/${code}/ws`, { headers });
    if (!res.webSocket) throw new Error(`upgrade failed: ${res.status}`);
    res.webSocket.accept();
    return new Client(res.webSocket);
  }

  static async join(
    code: string,
    name: string,
    extra: { hostKey?: string; resume?: string } = {},
  ): Promise<{ client: Client; welcome: Of<"welcome"> }> {
    const client = await Client.open(code);
    client.send({ t: "hello", v: 1, name, ...extra });
    const welcome = await client.next("welcome");
    return { client, welcome };
  }

  send(msg: unknown): void {
    this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  /** Resolves with the first buffered or future message of type `t`, consuming it. */
  async next<T extends ServerMsg["t"]>(t: T, timeoutMs = 2000): Promise<Of<T>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Of<T>;
      if (this.closed) throw new Error(`closed (${this.closed.code}) while waiting for ${t}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${t}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Waits until the socket is closed by the server. */
  async waitClosed(timeoutMs = 2000): Promise<{ code: number; reason: string }> {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed) {
      if (Date.now() > deadline) throw new Error("socket still open");
      await new Promise((r) => setTimeout(r, 10));
    }
    return this.closed;
  }

  /** Lets in-flight messages arrive. */
  settle(ms = 50): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  of<T extends ServerMsg["t"]>(t: T): Of<T>[] {
    return this.inbox.filter((m) => m.t === t) as Of<T>[];
  }

  close(): void {
    this.ws.close(1000, "bye");
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const fn of w) fn();
  }
}
