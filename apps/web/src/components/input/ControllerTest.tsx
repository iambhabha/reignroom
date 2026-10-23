import { BUTTONS, BUTTON_BIT, BUTTON_LABEL, type Button, type PadState } from "@reignroom/protocol";
import type { ControllerSnapshot } from "../../lib/input/controller.ts";
import { KEYMAP } from "../../lib/input/read.ts";

const on = (s: PadState, b: Button) => (s.b & BUTTON_BIT[b]) !== 0;
const fill = (pressed: boolean) => (pressed ? "fill-accent stroke-accent" : "fill-surface-2 stroke-border-strong");
const ink = (pressed: boolean) => (pressed ? "stroke-accent-ink" : "stroke-text");

/**
 * Live picture of a PS2-style controller (drawn from scratch; no console artwork) with the
 * pressed controls highlighted, plus the same information as text.
 */
export function ControllerTest({ snap }: { snap: ControllerSnapshot }) {
  const s = snap.state;
  const pressed = BUTTONS.filter((b) => on(s, b)).map((b) => BUTTON_LABEL[b]);
  if (s.l2 > 0) pressed.push(`L2 ${Math.round((s.l2 / 255) * 100)}%`);
  if (s.r2 > 0) pressed.push(`R2 ${Math.round((s.r2 / 255) * 100)}%`);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {snap.gamepad ? (
          <>
            <span className="font-semibold">Controller found:</span> {snap.gamepad}
          </>
        ) : (
          <>
            <span className="font-semibold">No controller found.</span> Press a button on it to wake it up
            (browsers only show a controller after a press), or use the keyboard.
          </>
        )}
      </p>
      {!snap.standard && (
        <p role="status" className="rounded-lg border border-accent/60 bg-surface-2 px-3 py-2 text-sm">
          Your browser doesn't recognise this controller's layout, so some buttons may be swapped. Check them here
          before playing.
        </p>
      )}

      <svg viewBox="0 0 480 270" className="w-full max-w-md" role="img" aria-label="Controller diagram">
        {/* body */}
        <path
          d="M90 60 H390 C440 60 470 110 470 170 C470 235 440 262 410 262 C380 262 360 230 340 205 H140 C120 230 100 262 70 262 C40 262 10 235 10 170 C10 110 40 60 90 60 Z"
          className="fill-surface stroke-border-strong"
          strokeWidth="2"
        />
        {/* shoulders */}
        <Shoulder x={60} y={8} label="L2" level={s.l2 / 255} />
        <Shoulder x={60} y={34} label="L1" level={on(s, "l1") ? 1 : 0} />
        <Shoulder x={320} y={8} label="R2" level={s.r2 / 255} />
        <Shoulder x={320} y={34} label="R1" level={on(s, "r1") ? 1 : 0} />
        {/* d-pad */}
        <rect x="88" y="94" width="24" height="26" rx="3" className={fill(on(s, "up"))} strokeWidth="2" />
        <rect x="88" y="144" width="24" height="26" rx="3" className={fill(on(s, "down"))} strokeWidth="2" />
        <rect x="60" y="120" width="28" height="24" rx="3" className={fill(on(s, "left"))} strokeWidth="2" />
        <rect x="112" y="120" width="28" height="24" rx="3" className={fill(on(s, "right"))} strokeWidth="2" />
        {/* face buttons */}
        <Face cx={380} cy={100} pressed={on(s, "triangle")}>
          <path d="M372 105 L380 92 L388 105 Z" fill="none" strokeWidth="2.5" className={ink(on(s, "triangle"))} />
        </Face>
        <Face cx={410} cy={132} pressed={on(s, "circle")}>
          <circle cx="410" cy="132" r="7" fill="none" strokeWidth="2.5" className={ink(on(s, "circle"))} />
        </Face>
        <Face cx={380} cy={164} pressed={on(s, "cross")}>
          <path d="M373 157 L387 171 M387 157 L373 171" strokeWidth="2.5" className={ink(on(s, "cross"))} />
        </Face>
        <Face cx={350} cy={132} pressed={on(s, "square")}>
          <rect x="343" y="125" width="14" height="14" fill="none" strokeWidth="2.5" className={ink(on(s, "square"))} />
        </Face>
        {/* select / start */}
        <rect x="196" y="112" width="30" height="12" rx="6" className={fill(on(s, "select"))} strokeWidth="2" />
        <rect x="254" y="112" width="30" height="12" rx="6" className={fill(on(s, "start"))} strokeWidth="2" />
        <text x="211" y="140" textAnchor="middle" className="fill-muted text-[11px]">SELECT</text>
        <text x="269" y="140" textAnchor="middle" className="fill-muted text-[11px]">START</text>
        {/* sticks */}
        <Stick cx={170} cy={200} x={s.lx} y={s.ly} click={on(s, "l3")} />
        <Stick cx={310} cy={200} x={s.rx} y={s.ry} click={on(s, "r3")} />
      </svg>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Pressed</dt>
        <dd className="font-semibold">{pressed.length ? pressed.join(", ") : "nothing"}</dd>
        <dt className="text-muted">Left stick</dt>
        <dd className="tabular-nums">{stickText(s.lx, s.ly)}</dd>
        <dt className="text-muted">Right stick</dt>
        <dd className="tabular-nums">{stickText(s.rx, s.ry)}</dd>
      </dl>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Keyboard controls</summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          <li>
            <kbd className="font-mono font-semibold">W A S D</kbd> Left stick
          </li>
          {KEYMAP.map((k) => (
            <li key={k.key}>
              <kbd className="font-mono font-semibold">{k.label}</kbd>{" "}
              {k.control === "stick" ? "Stick" : BUTTON_LABEL[k.control]}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function stickText(x: number, y: number): string {
  if (x === 0 && y === 0) return "centre";
  const h = x < 0 ? "left" : x > 0 ? "right" : "";
  const v = y < 0 ? "up" : y > 0 ? "down" : "";
  return `${[v, h].filter(Boolean).join("-")} (${x}, ${y})`;
}

function Shoulder({ x, y, label, level }: { x: number; y: number; label: string; level: number }) {
  return (
    <g>
      <rect x={x} y={y} width="100" height="22" rx="8" className="fill-surface-2 stroke-border-strong" strokeWidth="2" />
      {level > 0 && <rect x={x + 2} y={y + 2} width={96 * level} height="18" rx="6" className="fill-accent" />}
      <text
        x={x + 50}
        y={y + 15.5}
        textAnchor="middle"
        className={"text-[12px] font-semibold " + (level > 0.5 ? "fill-accent-ink" : "fill-text")}
      >
        {label}
      </text>
    </g>
  );
}

function Face({ cx, cy, pressed, children }: { cx: number; cy: number; pressed: boolean; children: React.ReactNode }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="15" className={fill(pressed)} strokeWidth="2" />
      {children}
    </g>
  );
}

function Stick({ cx, cy, x, y, click }: { cx: number; cy: number; x: number; y: number; click: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="30" className="fill-surface-2 stroke-border-strong" strokeWidth="2" />
      <circle
        cx={cx + (x / 128) * 18}
        cy={cy + (y / 128) * 18}
        r="13"
        className={click ? "fill-accent stroke-accent" : "fill-muted stroke-border-strong"}
        strokeWidth="2"
      />
    </g>
  );
}
