import { NETPLAY_RELAY_MAX } from "@reignroom/protocol";
import type { RoomConnection } from "../room-connection.ts";

/** The connection a NetplaySession talks over: send text, receive "message" events. */
export interface NetplayLink {
  readonly open: boolean;
  send(text: string): void;
  /** Called on every netplay tick: sends bundled input that has waited long enough. */
  tick(): void;
  onMessage(fn: (text: string) => void): () => void;
}

/** Input messages wait up to this long to be bundled; anything else goes out at once. */
const BUNDLE_MS = 30;

/**
 * Netplay through the room's own socket, relayed by the room to one other member. Works on any
 * network (no peer-to-peer connection, no TURN). Messages are bundled into JSON arrays so a
 * match costs ~30 room messages a second per player instead of one per frame.
 */
export class RoomNetplayLink implements NetplayLink {
  private queue: string[] = [];
  private lastFlush = 0;
  private scheduled = false;
  private listeners = new Set<(text: string) => void>();
  private off: () => void;

  constructor(
    private readonly conn: RoomConnection,
    private readonly peer: string,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.off = conn.onNetplay((from, data) => {
      if (from !== this.peer) return;
      let items: unknown;
      try {
        items = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const text = JSON.stringify(item);
        for (const fn of this.listeners) fn(text);
      }
    });
  }

  get open(): boolean {
    return this.conn.getSnapshot().status === "open";
  }

  send(text: string): void {
    this.queue.push(text);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const onlyInput = this.queue.every((t) => t.startsWith('{"t":"in"'));
      if (!onlyInput || this.now() - this.lastFlush >= BUNDLE_MS) this.flush();
    });
  }

  /** Called on every netplay tick, so bundled input never waits more than BUNDLE_MS. */
  tick(): void {
    if (this.queue.length && this.now() - this.lastFlush >= BUNDLE_MS) this.flush();
  }

  flush(): void {
    if (!this.queue.length) return;
    this.lastFlush = this.now();
    let chunk: string[] = [];
    let size = 2;
    const sendChunk = () => {
      if (chunk.length) this.conn.send({ t: "np", to: this.peer, d: `[${chunk.join(",")}]` });
      chunk = [];
      size = 2;
    };
    for (const text of this.queue) {
      if (size + text.length + 1 > NETPLAY_RELAY_MAX) sendChunk();
      chunk.push(text);
      size += text.length + 1;
    }
    sendChunk();
    this.queue = [];
  }

  onMessage(fn: (text: string) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  dispose(): void {
    this.off();
    this.listeners.clear();
    this.queue = [];
  }
}
