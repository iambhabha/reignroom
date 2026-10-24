import { NetplayMsg } from "@reignroom/protocol";
import { describe, expect, it } from "vitest";
import type { PlayPad } from "../emu/emulator.ts";
import { delayForRtt, Lockstep, type LockstepEmulator } from "./lockstep.ts";

const hex = (n: number) => n.toString(16).padStart(16, "0");

/** Runs one frame per step if it has that frame's input; records what it was given. */
class FakeEmulator implements LockstepEmulator {
  frame = 0;
  given = new Map<number, [PlayPad, PlayPad]>();
  hashes: [number, string][] = [];
  hashFor: (frame: number) => string = (f) => hex(f);

  pushFrame(frame: number, p1: PlayPad, p2: PlayPad): boolean {
    this.given.set(frame, [p1, p2]);
    return true;
  }
  step(): void {
    if (!this.given.has(this.frame)) return; // waits, like Play! does
    if (this.frame % 60 === 0) this.hashes.push([this.frame, this.hashFor(this.frame)]);
    this.frame++;
  }
  hashesSince(from: number) {
    return { next: this.hashes.length, hashes: this.hashes.slice(from) };
  }
}

/** Two players joined by a link that delivers each message `latency` steps later. */
function match(latency: number, delay: number) {
  const host = new FakeEmulator();
  const guest = new FakeEmulator();
  const toGuest: { at: number; msg: NetplayMsg }[] = [];
  const toHost: { at: number; msg: NetplayMsg }[] = [];
  let now = 0;
  // Each player presses a different, changing pattern so a mix-up would show.
  const hostInput = (): PlayPad => [host.frame % 7, 127, 127, 127, 127];
  const guestInput = (): PlayPad => [1000 + (guest.frame % 5), 10, 20, 30, 40];
  // Messages are validated as the real session does.
  const wire = (q: typeof toGuest) => (msg: NetplayMsg) => q.push({ at: now + latency, msg: NetplayMsg.parse(msg) });
  const a = new Lockstep("host", delay, host, wire(toGuest), hostInput, () => now);
  const b = new Lockstep("guest", delay, guest, wire(toHost), guestInput, () => now);
  const deliver = (q: typeof toGuest, to: Lockstep) => {
    while (q.length && q[0]!.at <= now) to.onMessage(q.shift()!.msg);
  };
  const run = (steps: number, guestEvery = 1) => {
    for (let i = 0; i < steps; i++, now++) {
      deliver(toGuest, b);
      deliver(toHost, a);
      a.tick();
      b.tick();
      host.step();
      if (i % guestEvery === 0) guest.step(); // a slower guest PC
      a.tick();
      b.tick();
    }
  };
  return { host, guest, a, b, run };
}

describe("Lockstep", () => {
  it("gives both emulators exactly the same input on every frame", () => {
    const { host, guest, run } = match(3, 4);
    run(2000);
    expect(host.frame).toBeGreaterThan(1500);
    const frames = Math.min(host.frame, guest.frame);
    for (let f = 0; f < frames; f++) expect(guest.given.get(f)).toEqual(host.given.get(f));
  });

  it("puts the host on P1 and the guest on P2", () => {
    const { host, run } = match(1, 2);
    run(300);
    const [p1, p2] = host.given.get(100)!;
    expect(p1[0]).toBeLessThan(7);
    expect(p2[0]).toBeGreaterThanOrEqual(1000);
  });

  it("starts with neutral pads for the first `delay` frames", () => {
    const { host, run } = match(1, 3);
    run(50);
    for (let f = 0; f < 3; f++) expect(host.given.get(f)).toEqual([[0, 127, 127, 127, 127], [0, 127, 127, 127, 127]]);
  });

  it("keeps the faster player in step with a slower one", () => {
    const { host, guest, a, run } = match(2, 4);
    run(1200, 2); // the guest's emulator runs at half speed
    expect(Math.abs(host.frame - guest.frame)).toBeLessThanOrEqual(4 + 2);
    expect(a.waitedMs).toBeGreaterThan(0);
  });

  it("reports the first frame whose memory differs", () => {
    const { guest, a, b, run } = match(1, 2);
    guest.hashFor = (f) => (f >= 300 ? hex(f + 1) : hex(f));
    run(600);
    expect(a.desyncFrame).toBe(300);
    expect(b.desyncFrame).toBe(300);
  });

  it("stays in sync when nothing differs", () => {
    const { a, b, run } = match(2, 3);
    run(600);
    expect(a.desyncFrame).toBeNull();
    expect(b.desyncFrame).toBeNull();
  });
});

describe("delayForRtt", () => {
  it("covers half the round trip plus a frame, within limits", () => {
    expect(delayForRtt(0, 2, 10)).toBe(2);
    expect(delayForRtt(60, 2, 10)).toBe(3); // 30 ms one way = 2 frames, +1
    expect(delayForRtt(150, 2, 10)).toBe(6);
    expect(delayForRtt(2000, 2, 10)).toBe(10);
  });
});
