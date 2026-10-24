import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RoomState } from "@reignroom/protocol";
import { Controller } from "../../lib/input/controller.ts";
import { GuestStream } from "../../lib/rtc/guest.ts";
import type { RoomConnection } from "../../lib/room-connection.ts";
import { Button } from "../Button.tsx";
import { ControllerTest } from "../input/ControllerTest.tsx";
import { fps, routeLabel, rttLabel, size } from "./format.ts";
import { NetplayView } from "./NetplayView.tsx";

export function GuestPanel({ conn, room, me }: { conn: RoomConnection; room: RoomState; me: string }) {
  const [stream] = useState(() => new GuestStream(conn, room.code));
  const snap = useSyncExternalStore(stream.subscribe, stream.getSnapshot);
  const [controller] = useState(() => new Controller());
  const pad = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [testOpen, setTestOpen] = useState(!room.live);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => stream.attach(), [stream]);
  useEffect(() => stream.syncRoom(room), [stream, room]);
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => stream.setInput(pad.state), [stream, pad.state]);

  // Attach the stream and start playback. Browsers may refuse sound without a recent
  // click; then play muted and offer an Unmute button.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = snap.stream;
    if (!snap.stream) return;
    video.muted = false;
    video.play().then(
      () => setMuted(false),
      () => {
        video.muted = true;
        setMuted(true);
        void video.play().catch(() => {});
      },
    );
  }, [snap.stream]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const host = room.members.find((m) => m.host);
  const hasAudio = (snap.stream?.getAudioTracks().length ?? 0) > 0;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen().catch(() => {});
  };

  const mySlot = room.members.find((m) => m.peer === me)?.slot ?? null;
  if (snap.netplay) {
    return (
      <section aria-labelledby="stream-heading" className="flex flex-col gap-3">
        <h2 id="stream-heading" className="font-display text-xl font-bold uppercase">
          Netplay
        </h2>
        {mySlot === 2 ? (
          <NetplayView role="guest" channel={snap.netplay} peerName={host?.name ?? null} />
        ) : (
          <p className="rounded-xl border border-border bg-surface p-4">
            {host?.name ?? "The host"} is playing netplay with the guest in the P2 slot. In netplay each player runs the
            game on their own computer, so there's no stream to watch. Take the P2 slot (if it's free) to play.
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="stream-heading" className="flex flex-col gap-3">
      <h2 id="stream-heading" className="sr-only">
        Game stream
      </h2>
      <div
        ref={frameRef}
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-black"
        onDoubleClick={snap.stream ? toggleFullscreen : undefined}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          aria-label={host ? `Live game from ${host.name}` : "Live game"}
          className={"size-full object-contain " + (snap.stream ? "" : "hidden")}
        />
        {snap.phase !== "playing" && (
          <p role="status" className="absolute inset-x-6 text-center text-lg font-semibold text-white">
            {!room.live
              ? "Waiting for the host to start streaming"
              : snap.phase === "reconnecting"
                ? "Picture stopped. Reconnecting…"
                : "Connecting to the host…"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatsLine stats={snap.stats} playing={snap.phase === "playing"} inputRttMs={snap.inputRttMs} />
        <div className="flex gap-2">
          {hasAudio && muted && (
            <Button
              size="sm"
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = false;
                setMuted(false);
                void v.play().catch(() => {});
              }}
            >
              Unmute
            </Button>
          )}
          <Button size="sm" onClick={toggleFullscreen} disabled={!snap.stream}>
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">Controller: </span>
            {controlStatus(room, me, snap)}
          </p>
          <Button size="sm" variant="quiet" aria-expanded={testOpen} onClick={() => setTestOpen((v) => !v)}>
            {testOpen ? "Hide controller test" : "Test controller"}
          </Button>
        </div>
        {testOpen && <ControllerTest snap={pad} />}
      </div>
    </section>
  );
}

function controlStatus(room: RoomState, me: string, snap: ReturnType<GuestStream["getSnapshot"]>): string {
  const slot = room.members.find((m) => m.peer === me)?.slot ?? null;
  if (slot === null) return "take a player slot to control a character.";
  if (!room.live) return `you'll control P${slot} once the host starts streaming.`;
  if (!snap.inputOpen || !snap.bridge) return `connecting your input as P${slot}…`;
  if (!snap.bridge.ok) return `you're P${slot}, but the host's controller bridge isn't connected yet, so your input can't reach the game.`;
  return `you control P${snap.bridge.pad ?? slot} in the game.`;
}

function StatsLine({
  stats,
  playing,
  inputRttMs,
}: {
  stats: ReturnType<GuestStream["getSnapshot"]>["stats"];
  playing: boolean;
  inputRttMs: number | null;
}) {
  if (!playing || !stats) return <p className="text-sm text-muted">No picture yet.</p>;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <Stat label="Input round trip" value={inputRttMs === null ? "—" : rttLabel(inputRttMs)} />
      <Stat label="Network round trip" value={rttLabel(stats.rttMs)} />
      <Stat label="Video" value={`${size(stats.width, stats.height)} · ${fps(stats.fps)}`} />
      <Stat label="Buffer" value={stats.bufferMs === null ? "—" : `${stats.bufferMs} ms`} />
      <Stat label="Route" value={routeLabel(stats.route)} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
