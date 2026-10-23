import { describe, expect, it } from "vitest";
import { ClientMsg, RoomCode, cleanText } from "../src/index.ts";

describe("cleanText", () => {
  it("keeps text as plain characters; markup is not special", () => {
    expect(cleanText("<img src=x onerror=alert(1)>", 300)).toBe("<img src=x onerror=alert(1)>");
  });

  it("removes bidi overrides and zero-width characters", () => {
    const rlo = String.fromCodePoint(0x202e);
    const zwsp = String.fromCodePoint(0x200b);
    expect(cleanText(`ad${rlo}min${zwsp}`, 20)).toBe("admin");
  });

  it("turns newlines and tabs into single spaces", () => {
    expect(cleanText("  a\n\n\tb  ", 20)).toBe("a b");
  });

  it("enforces the length limit", () => {
    expect(cleanText("x".repeat(50), 20)).toHaveLength(20);
  });
});

describe("RoomCode", () => {
  it("accepts codes from the alphabet only", () => {
    expect(RoomCode.safeParse("ABC234").success).toBe(true);
    expect(RoomCode.safeParse("ABCD10").success).toBe(false); // 1 and 0 excluded
    expect(RoomCode.safeParse("abc234").success).toBe(false);
    expect(RoomCode.safeParse("ABC2345").success).toBe(false);
  });
});

describe("ClientMsg", () => {
  it("parses a hello", () => {
    const r = ClientMsg.safeParse({ t: "hello", v: 1, name: "Ryu" });
    expect(r.success).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(ClientMsg.safeParse({ t: "ready", ready: true, admin: true }).success).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(ClientMsg.safeParse({ t: "eval", code: "1" }).success).toBe(false);
  });

  it("rejects slots outside 1–4", () => {
    expect(ClientMsg.safeParse({ t: "slot", slot: 5 }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: "slot", slot: null }).success).toBe(true);
  });

  it("accepts end-of-candidates", () => {
    expect(ClientMsg.safeParse({ t: "ice", to: "abcdefghijkl", cand: null }).success).toBe(true);
  });
});
