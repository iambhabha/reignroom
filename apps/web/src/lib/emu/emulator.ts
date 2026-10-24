import { BUTTON_BIT, NEUTRAL, type Button, type PadState } from "@reignroom/protocol";
import { DiscImageDevice } from "./disc.ts";
import { FrameStats, type FrameSummary } from "./frames.ts";

/**
 * Play! (https://github.com/jpd002/Play-, BSD-2-Clause) built for the browser with ReignRoom's
 * input patch (emulator/play-reignroom.patch): both pads take their full state from
 * setPadState(). Versioned folder, so the files can be cached forever.
 */
export const EMU_BASE = "/emu/rr2/";
/** Play! emulates no multitap, so only pads 1 and 2 exist. */
export const EMU_PADS = 2;

interface PlayModule {
  HEAPU8: Uint8Array;
  FS: { mkdir(path: string): void };
  ccall(name: string, ret: string, types: string[], args: unknown[]): unknown;
  bootDiscImage(name: string): void;
  getFrames(): number;
  setPadState(pad: number, buttons: number, lx: number, ly: number, rx: number, ry: number): void;
  startLockstep(clockBase: number): void;
  stopLockstep(): void;
  pushFrameInput(frame: number, ...pads: number[]): boolean;
  getEmuFrame(): number;
  getHashCount(): number;
  getHash(index: number): string;
  discImageDevice?: DiscImageDevice;
}

/** One frame's input for both pads, in Play!'s form (see toPlayPad). */
export type PlayPad = [number, number, number, number, number];
export const NEUTRAL_PLAY_PAD: PlayPad = [0, 127, 127, 127, 127];

/** PS2::CControllerInfo::BUTTON order in Play!; the bit index for setPadState's mask. */
const PS2_BIT: Record<Button | "l2" | "r2", number> = {
  up: 4, down: 5, left: 6, right: 7, select: 8, start: 9,
  square: 10, triangle: 11, circle: 12, cross: 13,
  l1: 14, l2: 15, l3: 16, r1: 17, r2: 18, r3: 19,
};
const BUTTON_NAMES = Object.keys(BUTTON_BIT) as Button[];

/** ReignRoom pad state → Play!'s (mask, lx, ly, rx, ry). Sticks: -128..127 → 0..255. */
export function toPlayPad(s: PadState): PlayPad {
  let mask = 0;
  for (const name of BUTTON_NAMES) if (s.b & BUTTON_BIT[name]) mask |= 1 << PS2_BIT[name];
  if (s.l2 >= 128) mask |= 1 << PS2_BIT.l2;
  if (s.r2 >= 128) mask |= 1 << PS2_BIT.r2;
  const axis = (v: number) => Math.max(0, Math.min(255, v + 127));
  return [mask, axis(s.lx), axis(s.ly), axis(s.rx), axis(s.ry)];
}

export type EmulatorPhase = "idle" | "loading" | "ready" | "running" | "error";

export interface EmulatorSnapshot {
  phase: EmulatorPhase;
  game: string | null;
  error: string | null;
  frames: FrameSummary | null;
}

const DISC_TYPES = [".iso", ".chd", ".cso", ".isz", ".bin"];

/**
 * The in-browser PS2 emulator on the host page. One per page: Play! can't be started twice.
 * The canvas it draws on is created here and moved into whatever element shows it.
 */
export class BrowserEmulator {
  readonly canvas: HTMLCanvasElement;
  private module: PlayModule | null = null;
  private stats: FrameStats | null = null;
  private listeners = new Set<() => void>();
  private snap: EmulatorSnapshot = { phase: "idle", game: null, error: null, frames: null };

  constructor() {
    this.canvas = document.createElement("canvas");
    // Play! looks the canvas up by this id (Source/ui_js/Main.cpp) and draws at 640×480.
    this.canvas.id = "outputCanvas";
    this.canvas.width = 640;
    this.canvas.height = 480;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  get running(): boolean {
    return this.snap.phase === "running";
  }

  /** Loads the emulator. The canvas must already be in the document. */
  async load(): Promise<void> {
    if (this.snap.phase !== "idle") return;
    if (!globalThis.crossOriginIsolated) {
      this.update({ phase: "error", error: "This page isn't cross-origin isolated, so the emulator can't use threads." });
      return;
    }
    this.update({ phase: "loading" });
    try {
      const { default: Play } = (await import(/* @vite-ignore */ `${EMU_BASE}Play.js`)) as {
        default: (o: object) => Promise<PlayModule>;
      };
      const module = await Play({
        locateFile: (path: string) => EMU_BASE + path,
        mainScriptUrlOrBlob: `${EMU_BASE}Play.js`,
        print: () => {},
        printErr: (text: string) => console.warn("[Play!]", text),
      });
      module.FS.mkdir("/work");
      module.discImageDevice = new DiscImageDevice(module);
      module.ccall("initVm", "", [], []);
      this.module = module;
      this.stats = new FrameStats(() => module.getFrames());
      setInterval(() => this.stats?.poll(), 1);
      setInterval(() => this.running && this.update({ frames: this.stats!.summary() }), 500);
      this.update({ phase: "ready" });
    } catch (err) {
      this.update({ phase: "error", error: `The emulator didn't start: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  /** Starts a disc image. Returns an error message, or null. */
  boot(file: File): string | null {
    const module = this.module;
    if (!module || this.snap.phase !== "ready") return "The emulator isn't ready yet.";
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!DISC_TYPES.includes(ext)) return "Pick a disc image: .iso, .chd, .cso, .isz or .bin.";
    module.discImageDevice!.setFile(file);
    module.bootDiscImage(file.name);
    for (let pad = 0; pad < EMU_PADS; pad++) this.setPad(pad, NEUTRAL);
    this.stats?.reset();
    this.update({ phase: "running", game: file.name });
    return null;
  }

  /**
   * Netplay: starts the game in lockstep. From here the emulator runs a frame only once
   * pushFrame() has given it both pads' input for that frame, and the PS2 clock is fixed to
   * `clockBase` (seconds, UTC) plus game time, the same for both players.
   */
  bootLockstep(file: File, clockBase: number): string | null {
    if (!this.module || this.snap.phase !== "ready") return "The emulator isn't ready yet.";
    this.module.startLockstep(clockBase);
    return this.boot(file);
  }

  /** Netplay: both pads' input for one frame. Frames must be given in order. */
  pushFrame(frame: number, p1: PlayPad, p2: PlayPad): boolean {
    return this.module?.pushFrameInput(frame, ...p1, ...p2) ?? false;
  }

  /** Netplay: the frame the emulator is on (frames since the game started). */
  get frame(): number {
    return this.module?.getEmuFrame() ?? 0;
  }

  /** Netplay: RAM hashes recorded every 60 frames, from index `from` on, as [frame, hash]. */
  hashesSince(from: number): { next: number; hashes: [number, string][] } {
    const module = this.module;
    if (!module) return { next: from, hashes: [] };
    const count = module.getHashCount();
    const hashes: [number, string][] = [];
    for (let i = Math.max(from, count - 64); i < count; i++) {
      const [frame, hash] = module.getHash(i).split(":");
      hashes.push([Number(frame), hash!]);
    }
    return { next: count, hashes };
  }

  /** pad: 0 for P1, 1 for P2. */
  setPad(pad: number, state: PadState): void {
    if (!this.module || pad < 0 || pad >= EMU_PADS) return;
    this.module.setPadState(pad, ...toPlayPad(state));
  }

  resetStats(): void {
    this.stats?.reset();
  }

  captureStream(): MediaStream {
    return this.canvas.captureStream(60);
  }

  private update(patch: Partial<EmulatorSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }
}

let shared: BrowserEmulator | null = null;
/** The page's single emulator. */
export function browserEmulator(): BrowserEmulator {
  return (shared ??= new BrowserEmulator());
}
