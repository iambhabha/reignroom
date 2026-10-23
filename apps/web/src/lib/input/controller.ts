import { NEUTRAL, type PadState } from "@reignroom/protocol";
import { KeyboardPad, activeGamepad, fromGamepad, mergeStates, sameState } from "./read.ts";

export interface ControllerSnapshot {
  state: PadState;
  /** Name the browser gives the controller, or null when only the keyboard is available. */
  gamepad: string | null;
  /** False when the browser doesn't know this controller's layout (buttons may be mixed up). */
  standard: boolean;
  source: "gamepad" | "keyboard" | "none";
}

/** Gamepad polling interval. Faster than the screen refresh, so input isn't held back up to a
 *  frame (~16 ms), and not tied to painting, which stops when a window is covered. */
const POLL_MS = 4;

/**
 * Reads the controller (the Gamepad API has no change events, so it is polled) and the
 * keyboard (event-driven), and publishes a snapshot only when something changed.
 */
export class Controller {
  private keyboard = new KeyboardPad(() => this.poll());
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private snap: ControllerSnapshot = { state: NEUTRAL, gamepad: null, standard: true, source: "none" };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  attach(): () => void {
    const detachKeys = this.keyboard.attach();
    this.timer = setInterval(() => this.poll(), POLL_MS);
    return () => {
      clearInterval(this.timer);
      detachKeys();
      this.snap = { state: NEUTRAL, gamepad: null, standard: true, source: "none" };
    };
  }

  private poll(): void {
    const gp = activeGamepad();
    const padState = gp ? fromGamepad(gp) : null;
    const keyState = this.keyboard.state();
    const state = mergeStates(padState, keyState);
    const source: ControllerSnapshot["source"] =
      padState && !sameState(padState, NEUTRAL) ? "gamepad" : this.keyboard.active ? "keyboard" : gp ? "gamepad" : "none";
    const next: ControllerSnapshot = {
      state,
      gamepad: gp?.id ?? null,
      standard: gp ? gp.mapping === "standard" : true,
      source,
    };
    const prev = this.snap;
    if (
      sameState(prev.state, next.state) &&
      prev.gamepad === next.gamepad &&
      prev.standard === next.standard &&
      prev.source === next.source
    ) {
      return;
    }
    this.snap = next;
    for (const fn of this.listeners) fn();
  }
}
