import { BUTTON_BIT, NEUTRAL } from "@reignroom/protocol";
import { describe, expect, it } from "vitest";
import { toPlayPad } from "./emulator.ts";

describe("toPlayPad", () => {
  it("centres the sticks and presses nothing for a neutral pad", () => {
    expect(toPlayPad(NEUTRAL)).toEqual([0, 127, 127, 127, 127]);
  });

  it("maps buttons to Play!'s PS2::CControllerInfo bit order", () => {
    const [mask] = toPlayPad({ ...NEUTRAL, b: BUTTON_BIT.cross | BUTTON_BIT.start | BUTTON_BIT.up | BUTTON_BIT.r3 });
    expect(mask).toBe((1 << 13) | (1 << 9) | (1 << 4) | (1 << 19));
  });

  it("treats L2/R2 past half travel as pressed", () => {
    expect(toPlayPad({ ...NEUTRAL, l2: 127, r2: 128 })[0]).toBe(1 << 18);
    expect(toPlayPad({ ...NEUTRAL, l2: 255 })[0]).toBe(1 << 15);
  });

  it("maps stick ends to 0 and 255, with +y down as on the PS2", () => {
    const [, lx, ly, rx, ry] = toPlayPad({ ...NEUTRAL, lx: -128, ly: 127, rx: 127, ry: -128 });
    expect([lx, ly, rx, ry]).toEqual([0, 254, 254, 0]);
  });
});
