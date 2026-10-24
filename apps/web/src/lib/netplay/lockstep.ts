import type { NetplayMsg } from "@reignroom/protocol";
import { NEUTRAL_PLAY_PAD, type PlayPad } from "../emu/emulator.ts";

/** What lockstep needs from the emulator (BrowserEmulator in the app, a fake in tests). */
export interface LockstepEmulator {
  readonly frame: number;
  pushFrame(frame: number, p1: PlayPad, p2: PlayPad): boolean;
  hashesSince(from: number): { next: number; hashes: [number, string][] };
}

/** Old frames' inputs and hashes are dropped after this many frames. */
const KEEP_FRAMES = 600;

/**
 * Delay-based lockstep for two players. Each side reads its own controller once per frame,
 * for the frame `delay` frames ahead, and sends it; the emulator gets a frame's input only
 * when both players' input for it is known. Both emulators therefore see the same input on the
 * same frame. Memory hashes are swapped to catch a desync.
 */
export class Lockstep {
  private local = new Map<number, PlayPad>();
  private remote = new Map<number, PlayPad>();
  private localHashes = new Map<number, string>();
  private remoteHashes = new Map<number, string>();
  private nextLocal: number;
  private nextPush = 0;
  private hashIndex = 0;
  private waitingSince: number | null = null;
  /** First frame whose memory hash differed between the players, if any. */
  desyncFrame: number | null = null;
  /** Milliseconds this side has spent waiting for the other player's input, in total. */
  waitedMs = 0;

  constructor(
    private readonly role: "host" | "guest",
    readonly delay: number,
    private readonly emu: LockstepEmulator,
    private readonly send: (msg: NetplayMsg) => void,
    private readonly readInput: () => PlayPad,
    private readonly now: () => number = () => performance.now(),
  ) {
    // The first `delay` frames have no input from anyone yet: both sides use neutral pads.
    for (let f = 0; f < delay; f++) {
      this.local.set(f, NEUTRAL_PLAY_PAD);
      this.remote.set(f, NEUTRAL_PLAY_PAD);
    }
    this.nextLocal = delay;
  }

  onMessage(msg: NetplayMsg): void {
    if (msg.t === "in") {
      if (msg.f >= this.nextPush && !this.remote.has(msg.f)) this.remote.set(msg.f, msg.s as PlayPad);
    } else if (msg.t === "hash") {
      this.remoteHashes.set(msg.f, msg.h);
      this.compare(msg.f);
    }
  }

  /** Call often (every few ms). */
  tick(): void {
    // 1. Read and send this player's input for every frame up to `delay` ahead.
    const target = this.emu.frame + this.delay;
    while (this.nextLocal <= target) {
      const s = this.readInput();
      this.local.set(this.nextLocal, s);
      this.send({ t: "in", f: this.nextLocal, s });
      this.nextLocal++;
    }

    // 2. Give the emulator every frame both inputs are known for.
    while (this.local.has(this.nextPush) && this.remote.has(this.nextPush)) {
      const mine = this.local.get(this.nextPush)!;
      const theirs = this.remote.get(this.nextPush)!;
      const [p1, p2] = this.role === "host" ? [mine, theirs] : [theirs, mine];
      if (!this.emu.pushFrame(this.nextPush, p1, p2)) break;
      this.local.delete(this.nextPush);
      this.remote.delete(this.nextPush);
      this.nextPush++;
    }

    // Waiting = the emulator has used up every frame it was given and the other player's
    // input for the next one hasn't arrived.
    const now = this.now();
    const blocked = this.emu.frame >= this.nextPush && !this.remote.has(this.nextPush);
    if (blocked && this.waitingSince === null) this.waitingSince = now;
    if (!blocked && this.waitingSince !== null) {
      this.waitedMs += now - this.waitingSince;
      this.waitingSince = null;
    }

    // 3. Share memory hashes and compare.
    const { next, hashes } = this.emu.hashesSince(this.hashIndex);
    this.hashIndex = next;
    for (const [f, h] of hashes) {
      this.localHashes.set(f, h);
      this.send({ t: "hash", f, h });
      this.compare(f);
    }
    for (const map of [this.localHashes, this.remoteHashes]) {
      for (const f of map.keys()) if (f < this.nextPush - KEEP_FRAMES) map.delete(f);
    }
  }

  /** True while the game is held up by the other player's input. */
  get waiting(): boolean {
    return this.waitingSince !== null;
  }

  private compare(f: number): void {
    const a = this.localHashes.get(f);
    const b = this.remoteHashes.get(f);
    if (a && b && a !== b && this.desyncFrame === null) this.desyncFrame = f;
  }
}

/** Input delay for a measured round trip: enough frames to cover one way, plus one spare. */
export function delayForRtt(rttMs: number, min: number, max: number): number {
  const oneWayFrames = Math.ceil(rttMs / 2 / (1000 / 60));
  return Math.max(min, Math.min(max, oneWayFrames + 1));
}
