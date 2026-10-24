import { NETPLAY_RELAY_MAX } from "@reignroom/protocol";
import { describe, expect, it } from "vitest";
import type { RoomConnection } from "../room-connection.ts";
import { RoomNetplayLink } from "./room-link.ts";

function fakeConn() {
  const sent: { t: string; to: string; d: string }[] = [];
  let listener: ((from: string, d: string) => void) | null = null;
  const conn = {
    getSnapshot: () => ({ status: "open" }),
    send: (msg: { t: string; to: string; d: string }) => sent.push(msg),
    onNetplay: (fn: (from: string, d: string) => void) => {
      listener = fn;
      return () => (listener = null);
    },
  } as unknown as RoomConnection;
  return { conn, sent, deliver: (from: string, d: string) => listener?.(from, d) };
}

const input = (f: number) => JSON.stringify({ t: "in", f, s: [0, 127, 127, 127, 127] });
const settle = () => new Promise<void>((r) => queueMicrotask(r));

describe("RoomNetplayLink", () => {
  it("bundles input: one room message per ~30 ms, not one per frame", async () => {
    let now = 0;
    const { conn, sent } = fakeConn();
    const link = new RoomNetplayLink(conn, "peer", () => now);
    // 60 frames over one second, ticking every 2 ms as the session does.
    for (let ms = 0; ms < 1000; ms += 2) {
      now = ms;
      if (ms % 16 === 0) link.send(input(ms / 16));
      await settle();
      link.tick();
    }
    now += 100;
    link.tick(); // the last frame's input goes out within the bundle window
    const frames = sent.flatMap((m) => JSON.parse(m.d) as { f: number }[]).map((m) => m.f);
    expect(frames).toEqual([...Array(63).keys()]);
    expect(sent.length).toBeLessThanOrEqual(35);
    expect(sent.every((m) => m.t === "np" && m.to === "peer")).toBe(true);
  });

  it("sends other messages at once, taking waiting input along", async () => {
    const { conn, sent } = fakeConn();
    const link = new RoomNetplayLink(conn, "peer", () => 5);
    link.send(input(0));
    await settle();
    expect(sent).toHaveLength(0); // input waits to be bundled
    link.send(JSON.stringify({ t: "ping", ts: 1 }));
    await settle();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.d)).toHaveLength(2);
  });

  it("splits a large backlog into messages the room accepts", () => {
    const { conn, sent } = fakeConn();
    const link = new RoomNetplayLink(conn, "peer", () => 1000);
    for (let f = 0; f < 200; f++) link.send(input(f));
    link.tick();
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((m) => m.d.length <= NETPLAY_RELAY_MAX)).toBe(true);
    expect(sent.flatMap((m) => JSON.parse(m.d) as unknown[])).toHaveLength(200);
  });

  it("unpacks bundles from the other player only", () => {
    const { conn, deliver } = fakeConn();
    const link = new RoomNetplayLink(conn, "peer");
    const got: string[] = [];
    link.onMessage((t) => got.push(t));
    deliver("someone-else", `[${input(1)}]`);
    deliver("peer", `[${input(2)},${input(3)}]`);
    deliver("peer", "not json");
    expect(got).toEqual([input(2), input(3)]);
  });
});
