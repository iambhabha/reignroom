import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Controller } from "../../lib/input/controller.ts";
import type { BrowserEmulator } from "../../lib/emu/emulator.ts";
import { canRemember, forgetDisc, openSavedDisc, pickAndRememberDisc, savedDiscName } from "../../lib/emu/saved-disc.ts";
import { Button } from "../Button.tsx";

/**
 * The in-browser emulator's screen, the disc picker and live frame statistics. The canvas
 * element belongs to the emulator and is moved in here.
 *
 * Stream mode (default): picking a disc boots it, and this player's controller drives P1.
 * Netplay: `onPick` receives the disc instead (the match starts it), and `waiting` replaces the
 * picker once a disc is chosen. Netplay reads the controller itself.
 */
export function EmulatorScreen({
  emulator,
  onPick,
  waiting,
  footer,
}: {
  emulator: BrowserEmulator;
  onPick?: (file: File) => void;
  waiting?: ReactNode;
  footer?: ReactNode;
}) {
  const snap = useSyncExternalStore(emulator.subscribe, emulator.getSnapshot);
  const holder = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    holder.current?.appendChild(emulator.canvas);
    void emulator.load();
  }, [emulator]);

  useEffect(() => {
    if (canRemember) void savedDiscName().then(setSaved);
  }, []);

  // Stream mode: the host's controller or keyboard plays P1.
  useEffect(() => {
    if (snap.phase !== "running" || onPick) return;
    const pad = new Controller();
    const off = pad.subscribe(() => emulator.setPad(0, pad.getSnapshot().state));
    const detach = pad.attach();
    return () => {
      off();
      detach();
    };
  }, [emulator, snap.phase, onPick]);

  const boot = (file: File | null) => {
    if (!file) return;
    if (onPick) onPick(file);
    else setMessage(emulator.boot(file));
  };
  const pickFile = async () => {
    if (canRemember) {
      const file = await pickAndRememberDisc();
      if (file) setSaved(file.name);
      boot(file);
    } else {
      fileInput.current?.click();
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);

  const f = snap.frames;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <div ref={holder} className="aspect-[4/3] w-full [&>canvas]:size-full [&>canvas]:object-contain" />
        {snap.phase !== "running" && (
          <div className="absolute inset-0 grid place-content-center gap-3 p-6 text-center">
            {snap.phase === "error" ? (
              <p role="alert" className="max-w-md font-medium text-danger">
                {snap.error}
              </p>
            ) : snap.phase !== "ready" ? (
              <p role="status" className="text-muted">
                Starting the emulator…
              </p>
            ) : waiting ? (
              <div role="status" className="max-w-md text-white">
                {waiting}
              </div>
            ) : (
              <>
                <p className="font-display text-xl font-bold uppercase text-white">Load your Urban Reign disc</p>
                <p className="max-w-sm text-sm text-white/75">
                  An ISO or CHD you made from your own disc. It's read from this computer only and never uploaded.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {saved && (
                    <Button variant="primary" onClick={async () => boot(await openSavedDisc())}>
                      Continue: {saved}
                    </Button>
                  )}
                  <Button variant={saved ? "secondary" : "primary"} onClick={() => void pickFile()}>
                    {saved ? "Choose another…" : "Choose disc image…"}
                  </Button>
                </div>
                {saved && (
                  <button
                    type="button"
                    className="text-sm text-white/70 underline underline-offset-2 hover:text-white"
                    onClick={() => void forgetDisc().then(() => setSaved(null))}
                  >
                    Forget this file
                  </button>
                )}
                {message && (
                  <p role="alert" className="text-sm font-medium text-danger">
                    {message}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".iso,.chd,.cso,.isz,.bin"
          hidden
          onChange={(e) => boot(e.target.files?.[0] ?? null)}
        />
      </div>

      {snap.phase === "running" && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums" aria-label="Emulator speed">
            <Stat label="Now" value={f ? `${f.fpsNow} fps` : "—"} tone={f ? f.fpsNow : null} />
            <Stat label="Average" value={f ? `${f.fpsAvg}` : "—"} tone={f ? f.fpsAvg : null} />
            <Stat label="1% low" value={f ? `${f.low1}` : "—"} tone={f ? f.low1 : null} />
            <Stat label="Worst second" value={f ? `${f.worstSecond}` : "—"} tone={f ? f.worstSecond : null} />
            <Stat label="Spikes" value={f ? `${f.spikes}` : "—"} tone={null} />
          </dl>
          <Button size="sm" variant="quiet" onClick={() => emulator.resetStats()}>
            Reset stats
          </Button>
        </div>
      )}
      {footer ??
        (snap.phase === "running" && (
          <p className="text-sm text-muted">
            You play <strong className="font-semibold text-text">P1</strong> with your controller or keyboard. The guest
            in the <strong className="font-semibold text-text">P2</strong> slot plays P2. This emulator has no multitap,
            so P3 and P4 can watch but not play.
          </p>
        ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: number | null }) {
  const color = tone === null ? "text-text" : tone >= 58 ? "text-success" : tone >= 45 ? "text-text" : "text-danger";
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${color}`}>{value}</dd>
    </div>
  );
}
