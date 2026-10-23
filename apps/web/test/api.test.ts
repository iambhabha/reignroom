import { describe, expect, it } from "vitest";
import { normaliseCode } from "../src/lib/api.ts";

describe("normaliseCode", () => {
  it("uppercases typed codes", () => {
    expect(normaliseCode("abc234")).toBe("ABC234");
  });

  it("drops spaces, dashes and characters that never appear in codes", () => {
    expect(normaliseCode("ab c-2 3 4")).toBe("ABC234");
    expect(normaliseCode("O0I1AB")).toBe("AB");
  });

  it("extracts the code from a pasted invite link", () => {
    expect(normaliseCode("https://reignroom.example/r/XK7P2Q")).toBe("XK7P2Q");
    expect(normaliseCode("https://reignroom.example/r/xk7p2q?x=1")).toBe("XK7P2Q");
  });

  it("caps the length at 6", () => {
    expect(normaliseCode("ABCDEFGH")).toBe("ABCDEF");
  });
});
