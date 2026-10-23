import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PLAYER_COUNTS, type RoomState } from "@reignroom/protocol";
import { inviteLink } from "../../lib/api.ts";
import { noticeText } from "../../lib/messages.ts";
import type { RoomConnection, Snapshot } from "../../lib/room-connection.ts";
import { Button } from "../Button.tsx";
import { Segmented } from "../Segmented.tsx";
import { Chat } from "./Chat.tsx";
import { SlotList } from "./SlotList.tsx";

export function Lobby({
  conn,
  snap,
  room,
  me,
}: {
  conn: RoomConnection;
  snap: Snapshot;
  room: RoomState;
  me: string;
}) {
  const navigate = useNavigate();
  const self = room.members.find((m) => m.peer === me);
  const isHost = self?.host ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-4">
            <p className="text-sm font-semibold tracking-wide text-muted uppercase">Room code</p>
            <ConnectionStatus status={snap.status} />
          </div>
          <p className="font-mono text-4xl font-semibold tracking-[0.2em]" aria-label={spell(room.code)}>
            {room.code}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CopyInvite code={room.code} />
          <Button
            variant="quiet"
            onClick={() => {
              conn.leave();
              navigate("/");
            }}
          >
            Leave room
          </Button>
        </div>
      </div>

      <NoticeBar snap={snap} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="flex flex-col gap-6">
          <SlotList conn={conn} room={room} me={me} isHost={isHost} />
          {isHost && (
            <section aria-labelledby="room-settings" className="flex flex-col gap-3">
              <h2 id="room-settings" className="font-display text-xl font-bold uppercase">
                Room settings
              </h2>
              <Segmented
                label="Players"
                options={PLAYER_COUNTS}
                value={room.players}
                onChange={(players) => conn.send({ t: "config", players })}
              />
            </section>
          )}
        </div>
        <Chat conn={conn} chat={snap.chat} room={room} me={me} disabled={snap.status !== "open"} />
      </div>
    </div>
  );
}

function spell(code: string): string {
  return `Room code ${code.split("").join(" ")}`;
}

function ConnectionStatus({ status }: { status: Snapshot["status"] }) {
  const label =
    status === "open" ? "Connected" : status === "reconnecting" ? "Reconnecting…" : "Connecting…";
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-muted">
      <span
        aria-hidden
        className={"size-2.5 rounded-full " + (status === "open" ? "bg-success" : "bg-accent")}
      />
      {label}
    </span>
  );
}

function CopyInvite({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(inviteLink(code));
            setCopied(true);
          } catch {
            prompt("Copy this invite link:", inviteLink(code));
          }
        }}
      >
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Invite link copied to clipboard" : ""}
      </span>
    </>
  );
}

/** Shows the latest non-fatal error for a few seconds. */
function NoticeBar({ snap }: { snap: Snapshot }) {
  const [visible, setVisible] = useState<Snapshot["notice"]>(null);
  useEffect(() => {
    if (!snap.notice) return;
    setVisible(snap.notice);
    const t = setTimeout(() => setVisible(null), 5000);
    return () => clearTimeout(t);
  }, [snap.notice]);

  return (
    <div aria-live="polite" className="min-h-0">
      {visible && (
        <p className="rounded-lg border border-danger/50 bg-danger-bg px-4 py-3 font-medium text-danger">
          {noticeText[visible.code]}
        </p>
      )}
    </div>
  );
}
