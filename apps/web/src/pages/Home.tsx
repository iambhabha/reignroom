import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  DEFAULT_PLAYERS,
  NAME_MAX,
  PLAYER_COUNTS,
  ROOM_CODE_LENGTH,
  cleanText,
  type PlayerCount,
} from "@reignroom/protocol";
import { Button } from "../components/Button.tsx";
import { Field } from "../components/Field.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { ApiFailure, createRoom, getRoomInfo, normaliseCode } from "../lib/api.ts";
import { noticeText } from "../lib/messages.ts";
import { hostKeyFor, savedName } from "../lib/storage.ts";

export function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState(savedName.get);
  const [nameError, setNameError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerCount>(DEFAULT_PLAYERS);
  const [busy, setBusy] = useState<"join" | "host" | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);

  function validName(): string | null {
    const clean = cleanText(name, NAME_MAX);
    if (!clean) {
      setNameError("Enter a name so other players know who you are.");
      return null;
    }
    setNameError(null);
    savedName.set(clean);
    return clean;
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const clean = validName();
    if (code.length !== ROOM_CODE_LENGTH) {
      setCodeError(`Room codes have ${ROOM_CODE_LENGTH} characters.`);
      return;
    }
    if (!clean) return;
    setCodeError(null);
    setBusy("join");
    try {
      await getRoomInfo(code);
      navigate(`/r/${code}`);
    } catch (err) {
      setCodeError(
        err instanceof ApiFailure && err.code !== "network"
          ? noticeText[err.code]
          : "Couldn't reach ReignRoom. Check your connection.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function host(e: FormEvent) {
    e.preventDefault();
    if (!validName()) return;
    setBusy("host");
    setHostError(null);
    try {
      const room = await createRoom(players);
      hostKeyFor.set(room.code, room.hostKey);
      navigate(`/r/${room.code}`);
    } catch (err) {
      setHostError(
        err instanceof ApiFailure && err.code === "rate_limited"
          ? "You've created several rooms in the last minute. Wait a moment and try again."
          : "Couldn't create a room. Check your connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="max-w-2xl">
        <h1 className="font-display text-4xl leading-tight font-bold uppercase sm:text-5xl">
          Play Urban Reign online
        </h1>
        <p className="mt-3 text-lg text-muted">
          One player hosts the PS2 game in PCSX2 and streams it. Up to three friends join from their
          browser and play with their own controllers.
        </p>
      </section>

      <div className="max-w-sm">
        <Field
          label="Your name"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          hint="Shown to the other players in the room."
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form
          onSubmit={join}
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
          noValidate
        >
          <div>
            <h2 className="font-display text-2xl font-bold uppercase">Join a room</h2>
            <p className="mt-1 text-muted">Enter the code from the host, or paste their invite link.</p>
          </div>
          <Field
            label="Room code"
            value={code}
            onChange={(e) => {
              setCode(normaliseCode(e.target.value));
              setCodeError(null);
            }}
            onPaste={(e) => {
              e.preventDefault();
              setCode(normaliseCode(e.clipboardData.getData("text")));
            }}
            placeholder="ABC234"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            error={codeError}
            inputClassName="max-w-48 font-mono text-xl tracking-[0.3em] uppercase"
          />
          <Button type="submit" variant="primary" size="lg" className="mt-auto" disabled={busy !== null}>
            {busy === "join" ? "Checking…" : "Join room"}
          </Button>
        </form>

        <form
          onSubmit={host}
          className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
          noValidate
        >
          <div>
            <h2 className="font-display text-2xl font-bold uppercase">Host a room</h2>
            <p className="mt-1 text-muted">
              You need a Windows PC with PCSX2 and your own Urban Reign disc image.
            </p>
          </div>
          <Segmented
            label="Players"
            options={PLAYER_COUNTS}
            value={players}
            onChange={setPlayers}
          />
          {hostError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {hostError}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" className="mt-auto" disabled={busy !== null}>
            {busy === "host" ? "Creating…" : "Create room"}
          </Button>
        </form>
      </div>
    </div>
  );
}
