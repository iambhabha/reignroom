import { describe, expect, it } from "vitest";
import { RoomCode, RoomInfoRes, Secret } from "@reignroom/protocol";
import { api, createRoom, freshIp } from "./helpers.ts";

describe("POST /api/rooms", () => {
  it("creates a room with a valid code and host key", async () => {
    const res = await api("/api/rooms", { method: "POST", body: JSON.stringify({ players: 3 }) });
    expect(res.status).toBe(201);
    const body = await res.json<{ code: string; hostKey: string }>();
    expect(RoomCode.safeParse(body.code).success).toBe(true);
    expect(Secret.safeParse(body.hostKey).success).toBe(true);
  });

  it("rejects bad bodies", async () => {
    for (const body of ["{", JSON.stringify({ players: 5 }), JSON.stringify({ players: 2, x: 1 })]) {
      const res = await api("/api/rooms", { method: "POST", body });
      expect(res.status).toBe(400);
    }
  });

  it("rate-limits room creation per IP (5 per minute)", async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await api("/api/rooms", { method: "POST", ip, body: JSON.stringify({ players: 2 }) });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it("rejects other methods", async () => {
    expect((await api("/api/rooms")).status).toBe(405);
  });
});

describe("GET /api/rooms/:code", () => {
  it("returns room info", async () => {
    const { code } = await createRoom(4);
    const res = await api(`/api/rooms/${code}`);
    expect(res.status).toBe(200);
    const info = RoomInfoRes.parse(await res.json());
    expect(info).toEqual({
      code,
      players: 4,
      openSlots: [1, 2, 3, 4],
      hostOnline: false,
      live: false,
      locked: false,
    });
  });

  it("404s for unknown and malformed codes", async () => {
    expect((await api("/api/rooms/ZZZZZZ")).status).toBe(404);
    expect((await api("/api/rooms/abc")).status).toBe(404);
    expect((await api("/api/rooms/ABCD10")).status).toBe(404);
  });
});

describe("GET /api/rooms/:code/ws", () => {
  it("refuses sockets from foreign origins", async () => {
    const { code } = await createRoom();
    const res = await api(`/api/rooms/${code}/ws`, {
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts same-origin sockets", async () => {
    const { code } = await createRoom();
    const res = await api(`/api/rooms/${code}/ws`, {
      headers: { Upgrade: "websocket", Origin: "https://rr.test" },
    });
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it("404s for rooms that don't exist", async () => {
    const res = await api("/api/rooms/ZZZZZZ/ws", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(404);
  });
});
