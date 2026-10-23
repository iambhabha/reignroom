import { z } from "zod";
import { SLOTS } from "./constants.ts";

/**
 * PS2 DualShock 2 buttons, in bit order for `PadState.b`. L2/R2 are not here: they are
 * analog (`l2`, `r2`, 0–255). Plain button names only; no game-specific move labels.
 */
export const BUTTONS = [
  "cross",
  "circle",
  "square",
  "triangle",
  "l1",
  "r1",
  "select",
  "start",
  "l3",
  "r3",
  "up",
  "down",
  "left",
  "right",
] as const;
export type Button = (typeof BUTTONS)[number];
export const BUTTON_BIT: Record<Button, number> = Object.fromEntries(
  BUTTONS.map((b, i) => [b, 1 << i]),
) as Record<Button, number>;
/** All valid button bits; bits 14–15 must be zero. */
export const BUTTON_MASK = (1 << BUTTONS.length) - 1;

/** Display names in the PS2's own terms. */
export const BUTTON_LABEL: Record<Button | "l2" | "r2", string> = {
  cross: "Cross",
  circle: "Circle",
  square: "Square",
  triangle: "Triangle",
  l1: "L1",
  r1: "R1",
  l2: "L2",
  r2: "R2",
  select: "Select",
  start: "Start",
  l3: "L3",
  r3: "R3",
  up: "D-pad up",
  down: "D-pad down",
  left: "D-pad left",
  right: "D-pad right",
};

const Axis = z.int().min(-128).max(127);
const Trigger = z.int().min(0).max(255);

/**
 * One controller's full state. Sticks: -128..127, +x right, +y DOWN (as the browser's
 * Gamepad API reports it). Full state every time, so a lost packet is fixed by the next one.
 */
export const PadState = z.strictObject({
  b: z.int().min(0).max(BUTTON_MASK),
  lx: Axis,
  ly: Axis,
  rx: Axis,
  ry: Axis,
  l2: Trigger,
  r2: Trigger,
});
export type PadState = z.infer<typeof PadState>;

export const NEUTRAL: PadState = { b: 0, lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0 };

const Seq = z.int().min(0).max(0xffffffff);
/** Sender's clock in ms (performance.now()); echoed back unchanged for round-trip timing. */
const Ts = z.number().finite().nonnegative();

// ── Guest ↔ host, over the "input" data channel (unordered, no retransmits) ─

export const GuestInput = z.strictObject({ t: z.literal("in"), seq: Seq, ts: Ts, ...PadState.shape });
export type GuestInput = z.infer<typeof GuestInput>;

export const HostToGuest = z.discriminatedUnion("t", [
  /** The host's agent applied input `seq` to the virtual controller. */
  z.strictObject({ t: z.literal("ack"), seq: Seq, ts: Ts }),
  /** Whether the host's controller bridge is connected and which pad this guest drives. */
  z.strictObject({ t: z.literal("bridge"), ok: z.boolean(), pad: z.literal(SLOTS).nullable() }),
]);
export type HostToGuest = z.infer<typeof HostToGuest>;

// ── Host page ↔ local agent (ws://127.0.0.1:AGENT_PORT) ──────────────────────

/** Fixed so the site's Content-Security-Policy can allow exactly this address. */
export const AGENT_PORT = 47823;
export const AGENT_URL = `ws://127.0.0.1:${AGENT_PORT}`;
export const AGENT_PROTOCOL = 1;

export const PairingToken = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const ToAgent = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("auth"), v: z.literal(AGENT_PROTOCOL), token: PairingToken }),
  z.strictObject({ t: z.literal("pad"), pad: z.literal(SLOTS), seq: Seq, ...PadState.shape }),
  z.strictObject({ t: z.literal("release"), pad: z.literal(SLOTS) }),
]);
export type ToAgent = z.infer<typeof ToAgent>;

export const DetectMatch = z.enum(["confirmed", "likely", "wrong_game", "no_game", "not_running"]);
export type DetectMatch = z.infer<typeof DetectMatch>;

export const AgentStatus = z.strictObject({
  t: z.literal("status"),
  version: z.string(),
  pcsx2: z.strictObject({
    running: z.boolean(),
    /** PCSX2's PINE interface answered (Settings > Advanced > PINE Settings > Enable). */
    pine: z.boolean(),
    serial: z.string().nullable(),
    title: z.string().nullable(),
    match: DetectMatch,
  }),
  /** Virtual controllers the agent created, by player slot. */
  pads: z.array(z.literal(SLOTS)),
  /** Pads that can't be created (driver missing) explain themselves here. */
  padError: z.string().nullable(),
});
export type AgentStatus = z.infer<typeof AgentStatus>;

export const FromAgent = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("ready") }),
  AgentStatus,
  z.strictObject({ t: z.literal("ack"), pad: z.literal(SLOTS), seq: Seq }),
  z.strictObject({
    t: z.literal("error"),
    code: z.enum(["bad_token", "bad_message", "version", "rate_limited", "replaced", "pad_unavailable"]),
  }),
]);
export type FromAgent = z.infer<typeof FromAgent>;

/** Urban Reign retail serials from PCSX2's GameIndex.yaml (the trial disc is excluded). */
export const URBAN_REIGN_SERIALS = ["SLUS-21209", "SCES-53688", "SLPS-25557", "SCAJ-20152", "SCKA-20065"] as const;
