import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX, type ChatEntry, type RoomState } from "@reignroom/protocol";
import type { RoomConnection } from "../../lib/room-connection.ts";
import { Button } from "../Button.tsx";
import { slotChip } from "./player.ts";

export function Chat({
  conn,
  chat,
  room,
  me,
  disabled,
}: {
  conn: RoomConnection;
  chat: ChatEntry[];
  room: RoomState;
  me: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);

  // Stay scrolled to the newest message unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    conn.send({ t: "chat", text });
    setDraft("");
    pinned.current = true;
  }

  const slotOf = (peer: string | null) => room.members.find((m) => m.peer === peer)?.slot ?? null;

  return (
    <section
      aria-labelledby="chat-heading"
      className="flex h-96 flex-col rounded-xl border border-border bg-surface lg:h-[32rem]"
    >
      <h2 id="chat-heading" className="border-b border-border px-4 py-3 font-display text-xl font-bold uppercase">
        Chat
      </h2>
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        aria-label="Chat messages"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
      >
        {chat.length === 0 && <li className="text-sm text-muted">No messages yet.</li>}
        {chat.map((entry) =>
          entry.kind === "system" ? (
            <li key={entry.id} className="text-sm text-muted">
              {entry.text}
            </li>
          ) : (
            <li key={entry.id} className="break-words">
              <span className="mr-2 inline-flex items-center gap-1.5 font-semibold">
                <SlotTag slot={slotOf(entry.peer)} />
                {entry.name}
                {entry.peer === me && <span className="sr-only">(you)</span>}
              </span>
              {entry.text}
            </li>
          ),
        )}
      </ol>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <input
          id="chat-input"
          value={draft}
          maxLength={CHAT_MAX}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={disabled ? "Reconnecting…" : "Say something"}
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-strong bg-bg px-3 text-text placeholder:text-muted/80 disabled:opacity-60"
        />
        <Button type="submit" variant="secondary" disabled={disabled || !draft.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}

function SlotTag({ slot }: { slot: 1 | 2 | 3 | 4 | null }) {
  if (slot === null) return null;
  return <span className={`rounded px-1 text-xs font-bold ${slotChip[slot]}`}>P{slot}</span>;
}
