import { useEffect, useState } from "react";
import { SLOTS, type Member, type RoomState, type Slot } from "@reignroom/protocol";
import type { RoomConnection } from "../../lib/room-connection.ts";
import { Button } from "../Button.tsx";
import { slotBar } from "./player.ts";

export function SlotList({
  conn,
  room,
  me,
  isHost,
}: {
  conn: RoomConnection;
  room: RoomState;
  me: string;
  isHost: boolean;
}) {
  const self = room.members.find((m) => m.peer === me);
  const slots = SLOTS.filter((s) => s <= room.players);
  const seated = room.members.filter((m) => m.slot !== null);
  const readyCount = seated.filter((m) => m.ready).length;
  const unseated = room.members.filter((m) => m.slot === null);

  return (
    <section aria-labelledby="players-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="players-heading" className="font-display text-xl font-bold uppercase">
          Players
        </h2>
        <p className="text-sm text-muted">
          {readyCount} of {slots.length} ready
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => (
          <SlotRow
            key={slot}
            slot={slot}
            member={room.members.find((m) => m.slot === slot)}
            me={me}
            isHost={isHost}
            conn={conn}
          />
        ))}
      </ul>

      {unseated.length > 0 && (
        <p className="text-sm text-muted">
          Not in a slot: {unseated.map((m) => (m.peer === me ? `${m.name} (you)` : m.name)).join(", ")}
        </p>
      )}

      <ReadyToggle
        ready={self?.ready ?? false}
        hasSlot={self?.slot != null}
        isHost={isHost}
        onChange={(ready) => conn.send({ t: "ready", ready })}
      />
    </section>
  );
}

function SlotRow({
  slot,
  member,
  me,
  isHost,
  conn,
}: {
  slot: Slot;
  member: Member | undefined;
  me: string;
  isHost: boolean;
  conn: RoomConnection;
}) {
  const mine = member?.peer === me;
  return (
    <li
      className={
        "flex min-h-16 items-center gap-3 rounded-lg border bg-surface py-2 pr-3 pl-2 " +
        (mine ? "border-border-strong" : "border-border")
      }
    >
      <span aria-hidden className={`w-1.5 self-stretch rounded-full ${slotBar[slot]}`} />
      <span className="w-9 font-display text-2xl font-bold">P{slot}</span>
      <div className="min-w-0 flex-1">
        {member ? (
          <>
            <p className="flex flex-wrap items-center gap-x-2 font-semibold">
              <span className="truncate">{member.name}</span>
              {mine && <Tag>You</Tag>}
              {member.host && <Tag>Host</Tag>}
            </p>
            <MemberStatus member={member} />
          </>
        ) : (
          <p className="text-muted">Open</p>
        )}
      </div>
      {!member && (
        <Button size="sm" onClick={() => conn.send({ t: "slot", slot })}>
          Take slot
        </Button>
      )}
      {mine && (
        <Button size="sm" variant="quiet" onClick={() => conn.send({ t: "slot", slot: null })}>
          Leave slot
        </Button>
      )}
      {member && !mine && isHost && !member.host && (
        <RemoveButton name={member.name} onConfirm={() => conn.send({ t: "kick", peer: member.peer })} />
      )}
    </li>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded border border-border-strong px-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </span>
  );
}

function MemberStatus({ member }: { member: Member }) {
  if (!member.online) return <p className="text-sm text-muted">Disconnected, holding slot</p>;
  return member.ready ? (
    <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
      <CheckIcon /> Ready
    </p>
  ) : (
    <p className="text-sm text-muted">Not ready</p>
  );
}

/** Two-step remove so a mis-click doesn't kick a friend. */
function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  return confirming ? (
    <Button size="sm" variant="danger" onClick={onConfirm} autoFocus>
      Remove {name}?
    </Button>
  ) : (
    <Button size="sm" variant="quiet" onClick={() => setConfirming(true)} aria-label={`Remove ${name}`}>
      Remove
    </Button>
  );
}

function ReadyToggle({
  ready,
  hasSlot,
  isHost,
  onChange,
}: {
  ready: boolean;
  hasSlot: boolean;
  isHost: boolean;
  onChange: (ready: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-pressed={ready}
        disabled={!hasSlot}
        onClick={() => onChange(!ready)}
        className={
          "flex min-h-14 items-center justify-center gap-3 rounded-lg border-2 px-6 font-display text-xl font-bold uppercase " +
          "transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (ready
            ? "border-success bg-success text-success-ink"
            : "border-accent bg-accent text-accent-ink hover:bg-accent-hover")
        }
      >
        <span
          aria-hidden
          className={
            "flex size-6 items-center justify-center rounded border-2 " +
            (ready ? "border-success-ink" : "border-accent-ink")
          }
        >
          {ready && <CheckIcon />}
        </span>
        I'm ready
      </button>
      <p className="text-sm text-muted">
        {!hasSlot
          ? "Take a player slot to get ready."
          : ready
            ? "Press again if you need more time."
            : isHost
              ? "Let your players know you're set."
              : "Let the host know you're set."}
      </p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3 8.5 6.5 12 13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
