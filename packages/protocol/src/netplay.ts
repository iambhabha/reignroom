import { z } from "zod";

/**
 * Netplay: host (P1) and guest (P2) both run the game in their own browser, in lockstep. Over
 * the "netplay" data channel (reliable, ordered) they exchange only each frame's controller
 * input and, once a second, a hash of the game's memory to catch a desync.
 */
export const NETPLAY_VERSION = 1;
/** Frames of input delay allowed; the host picks one from the measured round trip. */
export const NETPLAY_DELAY_MIN = 2;
export const NETPLAY_DELAY_MAX = 10;

const Byte = z.int().min(0).max(255);
/** One pad for one frame in Play!'s form: button mask (PS2 order, 20 bits), LX, LY, RX, RY. */
export const PlayPadWire = z.tuple([z.int().min(0).max(0xfffff), Byte, Byte, Byte, Byte]);
const Frame = z.int().min(0).max(0x7fffffff);

export const NetplayMsg = z.discriminatedUnion("t", [
  z.strictObject({ t: z.literal("hello"), v: z.literal(NETPLAY_VERSION) }),
  /** The disc image this player picked: a fingerprint and its file name (for display). */
  z.strictObject({ t: z.literal("disc"), id: z.string().regex(/^[0-9a-f]{32}$/), name: z.string().max(200) }),
  z.strictObject({ t: z.literal("ping"), ts: z.number().finite() }),
  z.strictObject({ t: z.literal("pong"), ts: z.number().finite() }),
  /** Host → guest: start now, with this input delay and PS2 clock (UTC seconds). */
  z.strictObject({
    t: z.literal("start"),
    delay: z.int().min(NETPLAY_DELAY_MIN).max(NETPLAY_DELAY_MAX),
    clock: z.int().min(0),
  }),
  /** This player's input for frame `f`. */
  z.strictObject({ t: z.literal("in"), f: Frame, s: PlayPadWire }),
  /** Hash of EE + IOP memory at frame `f`. */
  z.strictObject({ t: z.literal("hash"), f: Frame, h: z.string().regex(/^[0-9a-f]{16}$/) }),
]);
export type NetplayMsg = z.infer<typeof NetplayMsg>;
