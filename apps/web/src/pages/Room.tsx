import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { NAME_MAX, RoomCode, cleanText } from "@reignroom/protocol";
import { Button } from "../components/Button.tsx";
import { Field } from "../components/Field.tsx";
import { Lobby } from "../components/lobby/Lobby.tsx";
import { ApiFailure, getRoomInfo } from "../lib/api.ts";
import { endText, noticeText } from "../lib/messages.ts";
import { RoomConnection, type EndReason } from "../lib/room-connection.ts";
import { hostKeyFor, savedName } from "../lib/storage.ts";

type Check = "checking" | "ok" | "missing" | "offline";

export function Room() {
  const params = useParams();
  const parsed = RoomCode.safeParse(params.code);
  if (!parsed.success) return <EndCard reason="room_not_found" />;
  return <RoomGate key={parsed.data} code={parsed.data} />;
}

/** Checks the room exists and collects a name before opening a connection. */
function RoomGate({ code }: { code: string }) {
  const [check, setCheck] = useState<Check>("checking");
  const [name, setName] = useState<string | null>(() => cleanText(savedName.get(), NAME_MAX) || null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    let live = true;
    getRoomInfo(code)
      .then(() => live && setCheck("ok"))
      .catch((err) => {
        if (!live) return;
        setCheck(err instanceof ApiFailure && err.code === "room_not_found" ? "missing" : "offline");
      });
    return () => {
      live = false;
    };
  }, [code]);

  if (check === "checking") return <p className="text-muted" role="status">Finding room {code}…</p>;
  if (check === "missing") return <EndCard reason="room_not_found" />;
  if (check === "offline") return <EndCard reason="connection_lost" onRetry={() => setCheck("checking")} />;

  if (!name) {
    return (
      <NamePrompt
        code={code}
        error={nameError}
        onSubmit={(n) => {
          setNameError(null);
          setName(n);
          setSession((s) => s + 1);
        }}
      />
    );
  }

  return (
    <Connected
      key={session}
      code={code}
      name={name}
      onNameRejected={(reason) => {
        setNameError(noticeText[reason]);
        setName(null);
      }}
    />
  );
}

function Connected({
  code,
  name,
  onNameRejected,
}: {
  code: string;
  name: string;
  onNameRejected: (reason: "name_taken" | "name_invalid") => void;
}) {
  const [conn] = useState(() => new RoomConnection(code, name, hostKeyFor.get(code)));
  const snap = useSyncExternalStore(conn.subscribe, conn.getSnapshot);

  useEffect(() => {
    conn.start();
    return () => conn.dispose();
  }, [conn]);

  useEffect(() => {
    if (snap.ended === "name_taken" || snap.ended === "name_invalid") onNameRejected(snap.ended);
  }, [snap.ended, onNameRejected]);

  if (snap.ended) {
    if (snap.ended === "name_taken" || snap.ended === "name_invalid") return null;
    return <EndCard reason={snap.ended} onRetry={() => conn.retry()} />;
  }
  if (!snap.room || !snap.peer) {
    return (
      <p className="text-muted" role="status">
        {snap.status === "reconnecting" ? "Reconnecting…" : `Joining room ${code}…`}
      </p>
    );
  }
  return <Lobby conn={conn} snap={snap} room={snap.room} me={snap.peer} />;
}

function NamePrompt({
  code,
  error,
  onSubmit,
}: {
  code: string;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState(savedName.get);
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = cleanText(value, NAME_MAX);
    if (!clean) {
      setLocalError("Enter a name so other players know who you are.");
      return;
    }
    savedName.set(clean);
    onSubmit(clean);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mx-auto flex max-w-md flex-col gap-5 rounded-xl border border-border bg-surface p-6"
    >
      <div>
        <p className="text-sm font-semibold tracking-wide text-muted uppercase">Room {code}</p>
        <h1 className="font-display text-3xl font-bold uppercase">Join the room</h1>
      </div>
      <Field
        label="Your name"
        value={value}
        maxLength={NAME_MAX}
        autoComplete="nickname"
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        error={localError ?? error}
      />
      <Button type="submit" variant="primary" size="lg">
        Join room
      </Button>
    </form>
  );
}

function EndCard({ reason, onRetry }: { reason: EndReason; onRetry?: () => void }) {
  const text = endText[reason];
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <h1 className="font-display text-3xl font-bold uppercase">{text.title}</h1>
      <p className="text-muted">{text.detail}</p>
      <div className="flex flex-wrap gap-3">
        {reason === "connection_lost" && onRetry && (
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        {reason === "version_mismatch" ? (
          <Button variant="primary" onClick={() => location.reload()}>
            Reload
          </Button>
        ) : (
          <Link
            to="/"
            className={
              "inline-flex min-h-11 items-center rounded-lg px-4 font-semibold " +
              (reason === "connection_lost"
                ? "border border-border-strong text-muted hover:bg-surface-2 hover:text-text"
                : "bg-accent text-accent-ink hover:bg-accent-hover")
            }
          >
            Back to home
          </Link>
        )}
      </div>
    </div>
  );
}
