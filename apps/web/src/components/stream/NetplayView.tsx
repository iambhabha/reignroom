import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { browserEmulator, toPlayPad } from "../../lib/emu/emulator.ts";
import { Controller } from "../../lib/input/controller.ts";
import type { NetplayLink } from "../../lib/netplay/room-link.ts";
import { NetplaySession, type NetplaySnapshot } from "../../lib/netplay/session.ts";
import { Button } from "../Button.tsx";
import { EmulatorScreen } from "./EmulatorScreen.tsx";

/**
 * Netplay for one side: this player's own emulator, their disc, and the match with the other
 * player over `link` (null while there's no other player). Host = P1, guest = P2.
 */
export function NetplayView({
  role,
  link,
  peerName,
}: {
  role: "host" | "guest";
  link: NetplayLink | null;
  peerName: string | null;
}) {
  const [emulator] = useState(() => browserEmulator());
  const [controller] = useState(() => new Controller());
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<NetplaySession | null>(null);

  useEffect(() => controller.attach(), [controller]);

  useEffect(() => {
    if (!link) {
      setSession(null);
      return;
    }
    const s = new NetplaySession(role, link, emulator, () => toPlayPad(controller.getSnapshot().state));
    setSession(s);
    return s.attach();
  }, [link, role, emulator, controller]);

  useEffect(() => {
    if (session && file) void session.setDisc(file);
  }, [session, file]);

  const snap = useSessionSnapshot(session);
  const me = role === "host" ? "P1" : "P2";
  const other = peerName ?? (role === "host" ? "P2" : "the host");

  return (
    <EmulatorScreen
      emulator={emulator}
      onPick={setFile}
      waiting={file ? <Waiting role={role} file={file} session={session} snap={snap} other={other} /> : undefined}
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            Netplay: you play <strong className="font-semibold text-text">{me}</strong> on your own copy of the game;
            only controller input goes between you and {other}.
          </p>
          {snap?.phase === "running" && <MatchStats snap={snap} />}
        </div>
      }
    />
  );
}

function useSessionSnapshot(session: NetplaySession | null): NetplaySnapshot | null {
  const subscribe = useCallback((fn: () => void) => session?.subscribe(fn) ?? (() => {}), [session]);
  return useSyncExternalStore(subscribe, () => session?.getSnapshot() ?? null);
}

function Waiting({
  role,
  file,
  session,
  snap,
  other,
}: {
  role: "host" | "guest";
  file: File;
  session: NetplaySession | null;
  snap: NetplaySnapshot | null;
  other: string;
}) {
  let status: string;
  let tone = "text-white/80";
  if (!session || !snap || !snap.peerReady) status = `Waiting for ${other} to open netplay…`;
  else if (!snap.myDisc) status = "Checking your disc…";
  else if (!snap.peerDisc) status = `Waiting for ${other} to choose their disc…`;
  else if (!session.discsMatch) {
    status = `${other}'s disc (${snap.peerDisc.name}) isn't the same as yours. Both players need the same version of the game, in the same file format.`;
    tone = "text-danger";
  } else if (role === "host") status = `${other} is ready.`;
  else status = `Ready. Waiting for the host to start…`;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-display text-lg font-bold uppercase">Your disc: {file.name}</p>
      <p className={`text-sm ${tone}`}>{status}</p>
      {snap?.rttMs != null && <p className="text-sm text-white/70">Ping {snap.rttMs} ms</p>}
      {snap?.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {snap.error}
        </p>
      )}
      {role === "host" && (
        <Button variant="primary" disabled={!session?.canStart} onClick={() => session?.start()}>
          Start match
        </Button>
      )}
    </div>
  );
}

function MatchStats({ snap }: { snap: NetplaySnapshot }) {
  const delayMs = snap.delay === null ? null : Math.round((snap.delay * 1000) / 60);
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
      <Item label="Ping" value={snap.rttMs === null ? "—" : `${snap.rttMs} ms`} />
      <Item label="Input delay" value={snap.delay === null ? "—" : `${snap.delay} frames (~${delayMs} ms)`} />
      <Item label="Waited for other player" value={`${(snap.waitedMs / 1000).toFixed(1)} s`} />
      <Item
        label="Sync"
        value={snap.desyncFrame === null ? "in sync" : `out of sync since frame ${snap.desyncFrame}`}
        tone={snap.desyncFrame === null ? "text-success" : "text-danger"}
      />
    </dl>
  );
}

function Item({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}
