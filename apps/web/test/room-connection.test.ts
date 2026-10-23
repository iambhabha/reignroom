import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomConnection } from "../src/lib/room-connection.ts";

/** Minimal stand-in for the browser WebSocket, driven by the test. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const room = { code: "ABC234", players: 2, live: false, locked: false, members: [] };

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "rr.test" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function joined(): { conn: RoomConnection; ws: FakeSocket } {
  const conn = new RoomConnection("ABC234", "Host", "K".repeat(43));
  conn.start();
  const ws = FakeSocket.all[0]!;
  ws.open();
  ws.receive({ t: "welcome", peer: "p".repeat(12), resume: "r".repeat(43), room, chat: [] });
  return { conn, ws };
}

describe("RoomConnection", () => {
  it("stops for good when another tab takes over (close code 4000)", () => {
    const { conn, ws } = joined();
    ws.serverClose(4000);
    expect(conn.getSnapshot()).toMatchObject({ status: "closed", ended: "replaced" });
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1); // no reconnect attempt
  });

  it("reconnects after an ordinary drop", () => {
    const { conn, ws } = joined();
    ws.serverClose(1006);
    expect(conn.getSnapshot().status).toBe("reconnecting");
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stops for good when removed by the host (close code 4001)", () => {
    const { conn, ws } = joined();
    ws.serverClose(4001);
    expect(conn.getSnapshot().ended).toBe("kicked");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
