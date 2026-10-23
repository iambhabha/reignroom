import { BUTTON_BIT, NEUTRAL, type Button, type PadState } from "@reignroom/protocol";

/**
 * Browser "standard" gamepad layout → PS2 buttons (W3C Gamepad spec, section "Remapping").
 * Index 6/7 (L2/R2) are analog and handled separately; 16 (home/PS) is not used.
 */
const STANDARD: Partial<Record<number, Button>> = {
  0: "cross",
  1: "circle",
  2: "square",
  3: "triangle",
  4: "l1",
  5: "r1",
  8: "select",
  9: "start",
  10: "l3",
  11: "r3",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

/** Ignore tiny stick noise so a resting stick doesn't send a stream of changes. */
const DEADZONE = 0.06;

function axis(v: number | undefined): number {
  if (v === undefined || Math.abs(v) < DEADZONE) return 0;
  return Math.max(-128, Math.min(127, Math.round(v * (v < 0 ? 128 : 127))));
}

function trigger(b: GamepadButton | undefined): number {
  if (!b) return 0;
  return Math.max(0, Math.min(255, Math.round((b.pressed && b.value === 0 ? 1 : b.value) * 255)));
}

export function fromGamepad(pad: Gamepad): PadState {
  let b = 0;
  pad.buttons.forEach((btn, i) => {
    const name = STANDARD[i];
    if (name && btn.pressed) b |= BUTTON_BIT[name];
  });
  return {
    b,
    lx: axis(pad.axes[0]),
    ly: axis(pad.axes[1]),
    rx: axis(pad.axes[2]),
    ry: axis(pad.axes[3]),
    l2: trigger(pad.buttons[6]),
    r2: trigger(pad.buttons[7]),
  };
}

/** First connected controller, preferring ones the browser maps to the standard layout. */
export function activeGamepad(): Gamepad | null {
  const pads = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
  return pads.find((p) => p.mapping === "standard") ?? pads[0] ?? null;
}

/** Keyboard fallback. Shown on the controller test screen. */
export const KEYMAP: { key: string; label: string; control: Button | "l2" | "r2" | "stick" }[] = [
  { key: "KeyK", label: "K", control: "cross" },
  { key: "KeyL", label: "L", control: "circle" },
  { key: "KeyJ", label: "J", control: "square" },
  { key: "KeyI", label: "I", control: "triangle" },
  { key: "KeyU", label: "U", control: "l1" },
  { key: "KeyO", label: "O", control: "r1" },
  { key: "KeyY", label: "Y", control: "l2" },
  { key: "KeyP", label: "P", control: "r2" },
  { key: "ArrowUp", label: "↑", control: "up" },
  { key: "ArrowDown", label: "↓", control: "down" },
  { key: "ArrowLeft", label: "←", control: "left" },
  { key: "ArrowRight", label: "→", control: "right" },
  { key: "Enter", label: "Enter", control: "start" },
  { key: "Backspace", label: "Backspace", control: "select" },
  { key: "KeyQ", label: "Q", control: "l3" },
  { key: "KeyE", label: "E", control: "r3" },
];
const STICK_KEYS = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] } as const;

/** Tracks held keys while the page has focus; ignores typing in text fields. */
export class KeyboardPad {
  private held = new Set<string>();

  /** `onChange` runs right after a key goes down or up, so keys don't wait for a poll. */
  constructor(private readonly onChange: () => void = () => {}) {}

  private onDown = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (!KEYMAP.some((k) => k.key === e.code) && !(e.code in STICK_KEYS)) return;
    e.preventDefault(); // keep arrows/Backspace from scrolling or navigating
    this.held.add(e.code);
    this.onChange();
  };
  private onUp = (e: KeyboardEvent) => {
    if (this.held.delete(e.code)) this.onChange();
  };
  private onBlur = () => {
    this.held.clear();
    this.onChange();
  };

  attach(): () => void {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    return () => {
      window.removeEventListener("keydown", this.onDown);
      window.removeEventListener("keyup", this.onUp);
      window.removeEventListener("blur", this.onBlur);
      this.held.clear();
    };
  }

  get active(): boolean {
    return this.held.size > 0;
  }

  state(): PadState {
    let b = 0;
    let l2 = 0;
    let r2 = 0;
    for (const k of KEYMAP) {
      if (!this.held.has(k.key)) continue;
      if (k.control === "l2") l2 = 255;
      else if (k.control === "r2") r2 = 255;
      else if (k.control !== "stick") b |= BUTTON_BIT[k.control];
    }
    let x = 0;
    let y = 0;
    for (const [code, [dx, dy]] of Object.entries(STICK_KEYS)) {
      if (this.held.has(code)) {
        x += dx;
        y += dy;
      }
    }
    return { ...NEUTRAL, b, l2, r2, lx: x < 0 ? -128 : x > 0 ? 127 : 0, ly: y < 0 ? -128 : y > 0 ? 127 : 0 };
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
  );
}

export function sameState(a: PadState, b: PadState): boolean {
  return (
    a.b === b.b && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry && a.l2 === b.l2 && a.r2 === b.r2
  );
}

/** Gamepad wins when it has anything pressed; otherwise the keyboard. */
export function mergeStates(pad: PadState | null, keys: PadState): PadState {
  if (!pad) return keys;
  const padIdle = sameState(pad, NEUTRAL);
  return padIdle ? keys : pad;
}
