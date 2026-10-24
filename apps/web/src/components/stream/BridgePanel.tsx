import { useState, useSyncExternalStore, type FormEvent } from "react";
import type { AgentStatus, RoomState } from "@reignroom/protocol";
import type { AgentBridge, BridgeSnapshot } from "../../lib/agent.ts";
import { Button } from "../Button.tsx";
import { Field } from "../Field.tsx";

/** Host only: connection to the ReignRoom agent that turns guests' input into controllers. */
export function BridgePanel({ bridge, room }: { bridge: AgentBridge; room: RoomState }) {
  const snap = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [editing, setEditing] = useState(false);
  const showForm = snap.state === "off" || snap.state === "bad_token" || editing;

  return (
    <section aria-labelledby="bridge-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bridge-heading" className="font-display text-xl font-bold uppercase">
          Controller bridge
        </h2>
        <StateTag state={snap.state} />
      </div>

      <p className="text-sm text-muted">{explain(snap)}</p>

      {snap.state === "paired" && snap.status && <AgentDetails status={snap.status} snap={snap} room={room} />}

      {showForm ? (
        <TokenForm
          bridge={bridge}
          initial={snap.token ?? ""}
          onDone={() => setEditing(false)}
          rejected={snap.state === "bad_token"}
        />
      ) : (
        <div className="flex flex-wrap gap-3">
          {snap.state === "replaced" && (
            <Button variant="secondary" onClick={() => snap.token && bridge.pair(snap.token)}>
              Use this tab
            </Button>
          )}
          <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
            Change token
          </Button>
        </div>
      )}
    </section>
  );
}

function StateTag({ state }: { state: BridgeSnapshot["state"] }) {
  const ok = state === "paired";
  const text = {
    off: "Not set up",
    connecting: "Connecting…",
    paired: "Connected",
    unreachable: "Agent not found",
    bad_token: "Wrong token",
    replaced: "In another tab",
  }[state];
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden className={"size-2.5 rounded-full " + (ok ? "bg-success" : "bg-danger")} />
      {text}
    </span>
  );
}

function explain(snap: BridgeSnapshot): string {
  switch (snap.state) {
    case "off":
      return "Run the ReignRoom agent on this computer (see Host setup). It turns your guests' controllers into virtual controllers for PCSX2. Paste the pairing token it shows.";
    case "connecting":
      return "Looking for the agent on this computer…";
    case "paired":
      return "Guests' input goes to the virtual controllers.";
    case "unreachable":
      return "The agent isn't answering. Start it (or check its window is still open); this connects by itself. If Chrome asked to allow access to devices on your local network, choose Allow.";
    case "bad_token":
      return "The agent refused this token. Copy the pairing token from the agent's window again.";
    case "replaced":
      return "Another ReignRoom tab is connected to the agent. Only one tab can be.";
  }
}

const MATCH_TEXT: Record<AgentStatus["pcsx2"]["match"], (s: AgentStatus["pcsx2"]) => string> = {
  confirmed: (s) => `Urban Reign detected (${s.serial}).`,
  likely: (s) =>
    `Probably Urban Reign (window title "${s.title}"). To confirm the disc, turn on PINE in PCSX2: Settings > Advanced > PINE Settings > Enable.`,
  wrong_game: (s) => `PCSX2 is running ${s.title ?? s.serial ?? "another game"}, not Urban Reign.`,
  no_game: () => "PCSX2 is open, but no game is running yet.",
  not_running: () => "PCSX2 isn't running.",
};

function AgentDetails({ status, snap, room }: { status: AgentStatus; snap: BridgeSnapshot; room: RoomState }) {
  const good = status.pcsx2.match === "confirmed" || status.pcsx2.match === "likely";
  const guestSlots = room.members.filter((m) => !m.host && m.slot !== null).map((m) => m.slot!);
  const uncovered = [...new Set([...snap.missingPads, ...guestSlots.filter((s) => !status.pads.includes(s))])].sort();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className={good ? "font-semibold" : "rounded-lg border border-accent/60 bg-surface-2 px-3 py-2 font-semibold"}>
        {good ? "" : "Warning: "}
        {MATCH_TEXT[status.pcsx2.match](status.pcsx2)}
      </p>
      <p>
        <span className="text-muted">Virtual controllers:</span>{" "}
        {status.pads.length ? status.pads.map((p) => `P${p}`).join(", ") : "none"}
      </p>
      {status.padError && <p className="font-medium text-danger">{status.padError}</p>}
      {uncovered.length > 0 && (
        <p className="font-medium text-danger">
          No virtual controller for {uncovered.map((p) => `P${p}`).join(", ")}, where a guest is playing. Restart the
          agent with <code className="font-mono">--pads 1,2,3,4</code>, or move that guest to another slot.
        </p>
      )}
    </div>
  );
}

function TokenForm({
  bridge,
  initial,
  onDone,
  rejected,
}: {
  bridge: AgentBridge;
  initial: string;
  onDone: () => void;
  rejected: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!bridge.pair(value)) {
      setError("That doesn't look like a pairing token. It's 22 letters, digits, - or _.");
      return;
    }
    setError(null);
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
      <Field
        label="Pairing token"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        error={error ?? (rejected ? "Refused by the agent." : null)}
        hint="Shown in the agent's window. Remembered in this browser."
        className="min-w-0 flex-1"
        inputClassName="font-mono"
      />
      <Button type="submit" variant="primary">
        Connect
      </Button>
    </form>
  );
}
