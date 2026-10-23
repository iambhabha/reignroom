import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, Client, createRoom } from "./helpers.ts";

const offer = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
const cand = (i: number) => ({
  candidate: `candidate:${i} 1 udp 2122260223 192.0.2.${i % 250} ${50000 + i} typ host`,
  sdpMid: "0",
  sdpMLineIndex: 0,
});

async function userChat(client: Client) {
  for (;;) {
    const { entry } = await client.next("chat");
    if (entry.kind === "user") return entry;
  }
}

async function hostAndGuest(players: 2 | 3 | 4 = 2) {
  const { code, hostKey } = await createRoom(players);
  const host = await Client.join(code, "Host", { hostKey });
  const guest = await Client.join(code, "Guest");
  return { code, hostKey, host, guest };
}

describe("joining", () => {
  it("seats the host in P1 and the first guest in P2", async () => {
    const { host, guest } = await hostAndGuest();
    expect(host.welcome.room.members).toHaveLength(1);
    expect(host.welcome.room.members[0]).toMatchObject({ name: "Host", host: true, slot: 1, online: true });
    expect(guest.welcome.room.members.map((m) => [m.name, m.slot, m.host])).toEqual([
      ["Host", 1, true],
      ["Guest", 2, false],
    ]);
    const state = await host.client.next("state");
    expect(state.room.members.map((m) => m.name)).toEqual(["Host", "Guest"]);
  });

  it("announces joins in chat, including to the person who joined", async () => {
    const { host, guest } = await hostAndGuest();
    await host.client.settle();
    expect(host.client.of("chat").map((c) => c.entry.text)).toEqual(["Host joined", "Guest joined"]);
    expect(guest.client.of("chat").map((c) => c.entry)).toMatchObject([
      { kind: "system", text: "Guest joined" },
    ]);
  });

  it("reserves a seat for the host: a 2-player room takes one guest", async () => {
    const { code, hostKey } = await createRoom(2);
    await Client.join(code, "Early guest");
    const other = await Client.open(code);
    other.send({ t: "hello", v: 1, name: "Second guest" });
    expect(await other.next("error")).toEqual({ t: "error", code: "room_full", fatal: true });
    // The host still gets in.
    const host = await Client.join(code, "Host", { hostKey });
    expect(host.welcome.room.members.find((m) => m.host)?.slot).toBe(1);
  });

  it("rejects a wrong host key", async () => {
    const { code } = await createRoom();
    const c = await Client.open(code);
    c.send({ t: "hello", v: 1, name: "Mallory", hostKey: "A".repeat(43) });
    expect(await c.next("error")).toMatchObject({ code: "bad_host_key", fatal: true });
    expect((await c.waitClosed()).code).toBe(1008);
  });

  it("rejects duplicate names case-insensitively", async () => {
    const { code } = await hostAndGuest(3);
    const c = await Client.open(code);
    c.send({ t: "hello", v: 1, name: "GUEST" });
    expect(await c.next("error")).toMatchObject({ code: "name_taken", fatal: true });
  });

  it("rejects names that are empty after cleaning", async () => {
    const { code } = await createRoom();
    const c = await Client.open(code);
    c.send({ t: "hello", v: 1, name: String.fromCodePoint(0x200b, 0x202e) });
    expect(await c.next("error")).toMatchObject({ code: "name_invalid", fatal: true });
  });

  it("reports a protocol version mismatch", async () => {
    const { code } = await createRoom();
    const c = await Client.open(code);
    c.send({ t: "hello", v: 99, name: "Future" });
    expect(await c.next("error")).toMatchObject({ code: "version_mismatch", fatal: true });
  });

  it("requires hello before anything else", async () => {
    const { code } = await createRoom();
    const c = await Client.open(code);
    c.send({ t: "ready", ready: true });
    expect(await c.next("error")).toMatchObject({ code: "bad_message", fatal: true });
  });

  it("lets a dropped member resume the same seat", async () => {
    const { code, guest, host } = await hostAndGuest();
    guest.client.close();
    await host.client.settle(100);
    // The seat is held and shown offline.
    const held = host.client.of("state").at(-1)!.room.members.find((m) => m.name === "Guest");
    expect(held).toMatchObject({ slot: 2, online: false });

    const again = await Client.join(code, "Guest", { resume: guest.welcome.resume });
    expect(again.welcome.peer).toBe(guest.welcome.peer);
    expect(again.welcome.room.members.find((m) => m.peer === again.welcome.peer)).toMatchObject({
      slot: 2,
      online: true,
    });
  });

  it("replaces the older socket when the host reconnects with the host key", async () => {
    const { code, hostKey, host } = await hostAndGuest();
    const second = await Client.join(code, "Host", { hostKey });
    expect(second.welcome.peer).toBe(host.welcome.peer);
    expect((await host.client.waitClosed()).code).toBe(4000);
  });
});

describe("lobby", () => {
  it("changes slots and rejects taken or out-of-range ones", async () => {
    const { host, guest } = await hostAndGuest(3);
    guest.client.send({ t: "slot", slot: 1 });
    expect(await guest.client.next("error")).toEqual({ t: "error", code: "slot_taken", fatal: false });
    guest.client.send({ t: "slot", slot: 4 });
    expect(await guest.client.next("error")).toMatchObject({ code: "slot_unavailable" });
    guest.client.send({ t: "slot", slot: 3 });
    await host.client.settle();
    const latest = host.client.of("state").at(-1)!;
    expect(latest.room.members.find((m) => m.name === "Guest")?.slot).toBe(3);
  });

  it("toggles ready, and clears it when the slot changes", async () => {
    const { host, guest } = await hostAndGuest(3);
    guest.client.send({ t: "ready", ready: true });
    await host.client.settle();
    expect(host.client.of("state").at(-1)!.room.members[1]?.ready).toBe(true);
    guest.client.send({ t: "slot", slot: 3 });
    await host.client.settle();
    expect(host.client.of("state").at(-1)!.room.members[1]).toMatchObject({ slot: 3, ready: false });
  });

  it("cannot be ready without a slot", async () => {
    const { guest } = await hostAndGuest();
    guest.client.send({ t: "slot", slot: null });
    guest.client.send({ t: "ready", ready: true });
    expect(await guest.client.next("error")).toMatchObject({ code: "slot_unavailable", fatal: false });
  });

  it("broadcasts cleaned chat as plain text", async () => {
    const { host, guest } = await hostAndGuest();
    guest.client.send({ t: "chat", text: "  <b>hi</b>\n\nthere " });
    const entry = await userChat(host.client);
    expect(entry).toMatchObject({ kind: "user", name: "Guest", text: "<b>hi</b> there" });
  });

  it("throttles chat to one message per 500 ms without disconnecting", async () => {
    const { host, guest } = await hostAndGuest();
    guest.client.send({ t: "chat", text: "one" });
    guest.client.send({ t: "chat", text: "two" });
    expect(await guest.client.next("error")).toEqual({ t: "error", code: "rate_limited", fatal: false });
    await host.client.settle(100);
    const userTexts = host.client.of("chat").filter((c) => c.entry.kind === "user");
    expect(userTexts.map((c) => c.entry.text)).toEqual(["one"]);
    expect(guest.client.closed).toBeNull();
  });

  it("sends chat history to people who join later", async () => {
    const { code, host } = await hostAndGuest(3);
    host.client.send({ t: "chat", text: "welcome" });
    await host.client.next("chat");
    await host.client.next("chat");
    const late = await Client.join(code, "Late");
    expect(late.welcome.chat.map((c) => c.text)).toEqual(["Host joined", "Guest joined", "welcome"]);
  });
});

describe("host controls", () => {
  it("kicks a guest", async () => {
    const { host, guest } = await hostAndGuest();
    host.client.send({ t: "kick", peer: guest.welcome.peer });
    await guest.client.next("kicked");
    expect((await guest.client.waitClosed()).code).toBe(4001);
    await host.client.settle();
    expect(host.client.of("state").at(-1)!.room.members.map((m) => m.name)).toEqual(["Host"]);
    expect(host.client.of("chat").at(-1)!.entry.text).toBe("Guest was removed by the host");
  });

  it("does not let guests kick, configure or stream", async () => {
    const { host, guest } = await hostAndGuest();
    for (const msg of [
      { t: "kick", peer: host.welcome.peer },
      { t: "config", players: 4 },
      { t: "stream", live: true },
    ]) {
      guest.client.send(msg);
      expect(await guest.client.next("error")).toMatchObject({ code: "not_host", fatal: false });
    }
  });

  it("changes the player count but not below occupied slots", async () => {
    const { host, guest } = await hostAndGuest(4);
    guest.client.send({ t: "slot", slot: 4 });
    await host.client.settle();
    host.client.send({ t: "config", players: 3 });
    expect(await host.client.next("error")).toMatchObject({ code: "players_below_occupied" });
    guest.client.send({ t: "slot", slot: 2 });
    await host.client.settle();
    host.client.send({ t: "config", players: 2 });
    await host.client.settle();
    expect(host.client.of("state").at(-1)!.room.players).toBe(2);
  });

  it("marks the room live, and not live when the host drops", async () => {
    const { host, guest } = await hostAndGuest();
    host.client.send({ t: "stream", live: true });
    await guest.client.settle();
    expect(guest.client.of("state").at(-1)!.room.live).toBe(true);
    host.client.close();
    await guest.client.settle(100);
    expect(guest.client.of("state").at(-1)!.room.live).toBe(false);
  });
});

describe("signaling relay", () => {
  it("relays sdp and ice between host and guest with the sender's id", async () => {
    const { host, guest } = await hostAndGuest();
    host.client.send({ t: "sdp", to: guest.welcome.peer, kind: "offer", sdp: offer });
    expect(await guest.client.next("sdp")).toEqual({
      t: "sdp",
      from: host.welcome.peer,
      kind: "offer",
      sdp: offer,
    });
    guest.client.send({ t: "ice", to: host.welcome.peer, cand: null });
    expect(await host.client.next("ice")).toEqual({ t: "ice", from: guest.welcome.peer, cand: null });
  });

  it("never relays guest to guest", async () => {
    const { code, guest } = await hostAndGuest(3);
    const other = await Client.join(code, "Other");
    guest.client.send({ t: "sdp", to: other.welcome.peer, kind: "offer", sdp: offer });
    expect(await guest.client.next("error")).toMatchObject({ code: "peer_not_found", fatal: false });
    await other.client.settle();
    expect(other.client.of("sdp")).toHaveLength(0);
  });

  it("handles a host joining three guests at once: 3 offers + 120 candidates, nothing dropped", async () => {
    const { code, hostKey } = await createRoom(4);
    const host = await Client.join(code, "Host", { hostKey });
    const guests = await Promise.all(["A", "B", "C"].map((n) => Client.join(code, n)));
    for (const g of guests) host.client.send({ t: "sdp", to: g.welcome.peer, kind: "offer", sdp: offer });
    for (let i = 0; i < 40; i++) {
      for (const g of guests) host.client.send({ t: "ice", to: g.welcome.peer, cand: cand(i) });
    }
    await host.client.settle(300);
    for (const g of guests) {
      expect(g.client.of("sdp")).toHaveLength(1);
      expect(g.client.of("ice")).toHaveLength(40);
    }
    expect(host.client.of("error")).toHaveLength(0);
    expect(host.client.closed).toBeNull();
  });

  it("drops a lobby-message flood with a notice, then closes on sustained flooding", async () => {
    const { guest } = await hostAndGuest();
    for (let i = 0; i < 40; i++) guest.client.send({ t: "ready", ready: i % 2 === 0 });
    await guest.client.settle(100);
    expect(guest.client.closed).toBeNull();
    expect(guest.client.of("error")[0]).toMatchObject({ code: "rate_limited", fatal: false });

    for (let i = 0; i < 100; i++) guest.client.send({ t: "ready", ready: i % 2 === 0 });
    expect((await guest.client.waitClosed()).code).toBe(1008);
  });

  it("closes sockets that send oversized messages", async () => {
    const { guest } = await hostAndGuest();
    guest.client.send({ t: "chat", text: "x".repeat(60_000) });
    expect((await guest.client.waitClosed()).code).toBe(1009);
  });
});

describe("expiry", () => {
  it("releases a dropped member's seat after the grace period", async () => {
    const { code, host, guest } = await hostAndGuest();
    guest.client.close();
    await host.client.settle(100);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (room) => {
      // @ts-expect-error test-only access to private state
      for (const s of room.seats.values()) if (s.heldUntil) s.heldUntil = Date.now() - 1;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await host.client.settle();
    expect(host.client.of("state").at(-1)!.room.members.map((m) => m.name)).toEqual(["Host"]);
  });

  it("deletes a room after 30 minutes with nobody connected", async () => {
    const { code } = await createRoom();
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    await runInDurableObject(stub, async (room) => {
      // @ts-expect-error test-only access to private state
      room.meta.emptySince = Date.now() - 31 * 60 * 1000;
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await api(`/api/rooms/${code}`)).status).toBe(404);
  });
});
