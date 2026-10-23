import { describe, expect, it } from "vitest";
import { BUTTON_BIT, GuestInput, NEUTRAL, ToAgent } from "@reignroom/protocol";
import { fromGamepad, mergeStates } from "../src/lib/input/read.ts";

function pad(pressed: number[], axes = [0, 0, 0, 0], l2 = 0, r2 = 0): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    touched: pressed.includes(i),
    value: i === 6 ? l2 : i === 7 ? r2 : pressed.includes(i) ? 1 : 0,
  }));
  return { id: "test", index: 0, connected: true, mapping: "standard", axes, buttons, timestamp: 0 } as unknown as Gamepad;
}

describe("fromGamepad (standard mapping)", () => {
  it("maps face buttons to PS2 names", () => {
    expect(fromGamepad(pad([0])).b).toBe(BUTTON_BIT.cross);
    expect(fromGamepad(pad([1])).b).toBe(BUTTON_BIT.circle);
    expect(fromGamepad(pad([2])).b).toBe(BUTTON_BIT.square);
    expect(fromGamepad(pad([3])).b).toBe(BUTTON_BIT.triangle);
  });

  it("maps shoulders, start/select, stick clicks and d-pad", () => {
    const s = fromGamepad(pad([4, 5, 8, 9, 10, 11, 12, 13, 14, 15]));
    for (const b of ["l1", "r1", "select", "start", "l3", "r3", "up", "down", "left", "right"] as const) {
      expect(s.b & BUTTON_BIT[b]).toBeTruthy();
    }
  });

  it("ignores the home/PS button", () => {
    expect(fromGamepad(pad([16])).b).toBe(0);
  });

  it("reads analog triggers as 0–255", () => {
    const s = fromGamepad(pad([], [0, 0, 0, 0], 1, 0.5));
    expect([s.l2, s.r2]).toEqual([255, 128]);
  });

  it("scales sticks to -128..127 with a small dead zone", () => {
    expect(fromGamepad(pad([], [-1, 1, 0.03, -0.5]))).toMatchObject({ lx: -128, ly: 127, rx: 0, ry: -64 });
  });
});

describe("mergeStates", () => {
  it("uses the keyboard while the gamepad is idle", () => {
    const keys = { ...NEUTRAL, b: BUTTON_BIT.cross };
    expect(mergeStates({ ...NEUTRAL }, keys)).toEqual(keys);
    const padState = { ...NEUTRAL, b: BUTTON_BIT.circle };
    expect(mergeStates(padState, keys)).toEqual(padState);
  });
});

describe("input messages", () => {
  it("accept a full state and reject out-of-range values", () => {
    const ok = { t: "in", seq: 1, ts: 12.5, b: 3, lx: -128, ly: 127, rx: 0, ry: 0, l2: 255, r2: 0 };
    expect(GuestInput.safeParse(ok).success).toBe(true);
    expect(GuestInput.safeParse({ ...ok, b: 1 << 14 }).success).toBe(false);
    expect(GuestInput.safeParse({ ...ok, lx: 128 }).success).toBe(false);
    expect(GuestInput.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it("only let the host page send auth, pad and release to the agent", () => {
    expect(ToAgent.safeParse({ t: "release", pad: 2 }).success).toBe(true);
    expect(ToAgent.safeParse({ t: "exec", cmd: "x" }).success).toBe(false);
    expect(ToAgent.safeParse({ t: "pad", pad: 5, seq: 1, ...NEUTRAL }).success).toBe(false);
  });
});
