import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { RoomState } from "@reignroom/protocol";
import { HostStream, type Source } from "../../lib/rtc/host.ts";
import { QUALITIES, uploadMbps, type Quality } from "../../lib/rtc/quality.ts";
import type { RoomConnection } from "../../lib/room-connection.ts";
import { Button } from "../Button.tsx";
import { Segmented } from "../Segmented.tsx";
import { fps, routeLabel, rttLabel, size } from "./format.ts";

const SOURCES: { value: Source; title: string; detail: string }[] = [
  { value: "window", title: "Game window", detail: "Pick the PCSX2 window. Guests see only the game, without sound." },
  {
    value: "screen",
    title: "Entire screen with sound",
    detail: "Includes game sound. Guests also see notifications and anything else on that screen.",
  },
  { value: "test", title: "Test pattern", detail: "Check that guests get smooth video before starting PCSX2." },
];

const qualityLabel = (q: Quality) => q.replace("p60", "p");

export function HostPanel({ conn, room }: { conn: RoomConnection; room: RoomState }) {
  const [stream] = useState(() => new HostStream(conn, room.code));
  const snap = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  const [source, setSource] = useState<Source>("window");

  useEffect(() => stream.attach(), [stream]);
  useEffect(() => stream.syncRoom(room), [stream, room]);

  const guests = room.members.filter((m) => !m.host);
  const onlineGuests = guests.filter((m) => m.online).length;
  const estimate = uploadMbps(snap.quality, onlineGuests, snap.live ? snap.hasAudio : source === "screen");

  return (
    <section aria-labelledby="stream-heading" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="stream-heading" className="font-display text-xl font-bold uppercase">
          Stream
        </h2>
        {snap.live && <LiveTag />}
      </div>

      {!snap.live ? (
        <>
          <SourcePicker value={source} onChange={setSource} disabled={snap.starting} />
          <Segmented
            label="Quality (60 fps)"
            options={QUALITIES}
            value={snap.quality}
            onChange={(q) => stream.setQuality(q)}
            format={qualityLabel}
            disabled={snap.starting}
          />
          <Estimate mbps={estimate} guests={onlineGuests} />
          {snap.error && (
            <p role="alert" className="font-medium text-danger">
              {snap.error}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            disabled={snap.starting}
            onClick={() => void stream.start(source)}
          >
            {snap.starting ? "Waiting for you to pick…" : "Start streaming"}
          </Button>
        </>
      ) : (
        <>
          {snap.surface === "monitor" && (
            <p role="status" className="rounded-lg border border-accent/60 bg-surface-2 px-4 py-3 text-sm">
              <strong className="font-semibold">You're sharing your entire screen.</strong> Guests can see
              notifications, chat pop-ups and any window you open on it.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <Preview stream={snap.preview} />
            <div className="flex flex-col gap-3">
              <Segmented
                label="Quality (60 fps)"
                options={QUALITIES}
                value={snap.quality}
                onChange={(q) => stream.setQuality(q)}
                format={qualityLabel}
              />
              <Estimate mbps={estimate} guests={onlineGuests} />
            </div>
          </div>
          <GuestList room={room} snap={snap} />
          <Button variant="danger" onClick={() => stream.stop()} className="self-start">
            Stop streaming
          </Button>
        </>
      )}
    </section>
  );
}

function LiveTag() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-danger/60 px-3 py-1 text-sm font-semibold text-danger">
      <span aria-hidden className="size-2 rounded-full bg-danger" />
      Live
    </span>
  );
}

function SourcePicker({
  value,
  onChange,
  disabled,
}: {
  value: Source;
  onChange: (s: Source) => void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">What to share</legend>
      {SOURCES.map((s) => {
        const checked = s.value === value;
        return (
          <label
            key={s.value}
            className={
              "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors " +
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus " +
              (checked ? "border-accent bg-surface-2" : "border-border-strong hover:bg-surface-2")
            }
          >
            <input
              type="radio"
              name={name}
              value={s.value}
              checked={checked}
              onChange={() => onChange(s.value)}
              aria-describedby={`${name}-${s.value}`}
              className="mt-1 size-4 accent-[var(--accent)]"
            />
            <span className="flex flex-col">
              <span className="font-semibold">{s.title}</span>
              <span id={`${name}-${s.value}`} className="text-sm text-muted">
                {s.detail}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Estimate({ mbps, guests }: { mbps: number; guests: number }) {
  return (
    <p className="text-sm text-muted">
      Your upload needed: about <strong className="font-semibold text-text">{mbps.toFixed(1)} Mbps</strong>{" "}
      {guests > 0 ? `for ${guests} guest${guests === 1 ? "" : "s"}` : "per guest"}. Each guest gets their own copy
      of the stream.
    </p>
  );
}

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      <video
        ref={ref}
        muted
        autoPlay
        playsInline
        aria-label="Preview of what you are sharing"
        className="aspect-video w-full object-contain"
      />
    </div>
  );
}

function GuestList({ room, snap }: { room: RoomState; snap: ReturnType<HostStream["getSnapshot"]> }) {
  const guests = room.members.filter((m) => !m.host);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Guests</h3>
      {guests.length === 0 ? (
        <p className="text-sm text-muted">No guests yet. Share the invite link.</p>
      ) : (
        <ul className="flex flex-col">
          {guests.map((g) => {
            const p = snap.peers[g.peer];
            const status = !g.online
              ? "Disconnected"
              : !p
                ? "Waiting"
                : p.phase === "connected"
                  ? "Watching"
                  : p.phase === "failed"
                    ? "Retrying…"
                    : "Connecting…";
            const s = p?.stats;
            const details = s
              ? [
                  `Round trip ${rttLabel(s.rttMs)}`,
                  `${size(s.width, s.height)} · ${fps(s.fps)}`,
                  s.kbps ? `${(s.kbps / 1000).toFixed(1)} Mbps` : null,
                  routeLabel(s.route),
                  s.limitedBy && s.limitedBy !== "none" ? `limited by ${s.limitedBy}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null;
            return (
              <li key={g.peer} className="flex flex-col gap-0.5 border-t border-border py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-sm">{status}</span>
                </p>
                {details && <p className="text-sm text-muted tabular-nums">{details}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
