import { DurableObject } from "cloudflare:workers";
import {
  CHAT_HISTORY,
  CHAT_MAX,
  ClientMsg,
  NAME_MAX,
  PROTOCOL_VERSION,
  ROOM_IDLE_MS,
  SLOTS,
  cleanText,
  type ChatEntry,
  type ErrorCode,
  type PlayerCount,
  type RoomInfoRes,
  type RoomState,
  type ServerMsg,
  type Slot,
} from "@reignroom/protocol";
import { newPeerId, newSecret, secretMatches, sha256 } from "./ids.ts";
import { LIMITS, TokenBucket } from "./limits.ts";

interface Meta {
  code: string;
  players: PlayerCount;
  live: boolean;
  /** New members are refused; held seats and the host can still come back. */
  locked: boolean;
  hostKeyHash: string;
  /** Set when the last socket closes; the room is deleted ROOM_IDLE_MS later. */
  emptySince: number | null;
  chatSeq: number;
}

interface Seat {
  peer: string;
  name: string;
  slot: Slot | null;
  ready: boolean;
  host: boolean;
  resumeHash: string;
  /** Set while the member is disconnected; the seat is released at this time. */
  heldUntil: number | null;
}

/** Survives hibernation with the socket. */
interface Attachment {
  peer: string | null;
}

/** In-memory only; resets if the object hibernates, which only happens when idle. */
interface SocketGuard {
  general: TokenBucket;
  signal: TokenBucket;
  netplay: TokenBucket;
  lastChat: number;
  strikes: number[];
  lastNotice: number;
}

type Msg<T extends ClientMsg["t"]> = Extract<ClientMsg, { t: T }>;

const CLOSE_NORMAL = 1000;
const CLOSE_POLICY = 1008;
const CLOSE_TOO_BIG = 1009;
const CLOSE_REPLACED = 4000;
const CLOSE_KICKED = 4001;

export class RoomDO extends DurableObject<Env> {
  private meta: Meta | null = null;
  private seats = new Map<string, Seat>();
  private chat: ChatEntry[] = [];
  private guards = new Map<WebSocket, SocketGuard>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<unknown>(["meta", "seats", "chat"]);
      this.meta = (stored.get("meta") as Meta | undefined) ?? null;
      this.seats = new Map(Object.entries((stored.get("seats") as Record<string, Seat>) ?? {}));
      this.chat = (stored.get("chat") as ChatEntry[] | undefined) ?? [];
    });
  }

  // ── RPC from the Worker ──────────────────────────────────────────────────

  /** Returns false if this code is already in use. */
  async init(code: string, players: PlayerCount, hostKeyHash: string): Promise<boolean> {
    if (this.meta) return false;
    this.meta = {
      code,
      players,
      live: false,
      locked: false,
      hostKeyHash,
      emptySince: Date.now(),
      chatSeq: 0,
    };
    await this.persist();
    await this.scheduleAlarm();
    return true;
  }

  async info(): Promise<RoomInfoRes | null> {
    const meta = this.meta;
    if (!meta) return null;
    const taken = new Set([...this.seats.values()].map((s) => s.slot));
    const openSlots = SLOTS.filter((s) => s <= meta.players && !taken.has(s));
    const online = this.onlinePeers();
    const host = [...this.seats.values()].find((s) => s.host);
    return {
      code: meta.code,
      players: meta.players,
      openSlots,
      hostOnline: host !== undefined && online.has(host.peer),
      live: meta.live,
      locked: meta.locked,
    };
  }

  /** True if `resume` is the current resume token of someone in this room. */
  async isMember(resume: string): Promise<boolean> {
    if (!this.meta) return false;
    const hash = await sha256(resume);
    return [...this.seats.values()].some((s) => s.resumeHash === hash);
  }

  // ── WebSocket lifecycle ──────────────────────────────────────────────────

  override async fetch(request: Request): Promise<Response> {
    if (!this.meta) return Response.json({ error: "room_not_found" }, { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    if (this.openSockets().length >= LIMITS.maxSockets) {
      return Response.json({ error: "room_full" }, { status: 503 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peer: null } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return this.fail(ws, "bad_message");
    if (raw.length > LIMITS.maxMessageChars) return ws.close(CLOSE_TOO_BIG, "message too large");

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.fail(ws, "bad_message", !this.peerOf(ws));
    }
    if (isObject(data) && data.t === "hello" && data.v !== PROTOCOL_VERSION) {
      return this.fail(ws, "version_mismatch", true);
    }
    const parsed = ClientMsg.safeParse(data);
    if (!parsed.success) return this.fail(ws, "bad_message", !this.peerOf(ws));
    const msg = parsed.data;

    const signaling = msg.t === "sdp" || msg.t === "ice" || msg.t === "want-offer";
    if (!this.allow(ws, msg.t === "np" ? "netplay" : signaling ? "signal" : "general")) return;

    const peer = this.peerOf(ws);
    if (msg.t === "hello") {
      if (peer) return this.fail(ws, "bad_message");
      return this.onHello(ws, msg);
    }
    const seat = peer ? this.seats.get(peer) : undefined;
    if (!seat) return this.fail(ws, "bad_message", true);

    switch (msg.t) {
      case "slot":
        return this.onSlot(ws, seat, msg);
      case "ready":
        return this.onReady(ws, seat, msg);
      case "chat":
        return this.onChat(ws, seat, msg);
      case "leave":
        await this.removeSeat(seat, `${seat.name} left`);
        return ws.close(CLOSE_NORMAL, "left");
      case "kick":
        return this.onKick(ws, seat, msg);
      case "config":
        return this.onConfig(ws, seat, msg);
      case "stream":
        return this.onStream(ws, seat, msg);
      case "lock":
        return this.onLock(ws, seat, msg);
      case "sdp":
      case "ice":
      case "want-offer":
        return this.onSignal(ws, seat, msg);
      case "np":
        return this.onNetplay(ws, seat, msg);
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
    await this.onGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onGone(ws);
  }

  override async alarm(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    const now = Date.now();
    for (const seat of [...this.seats.values()]) {
      if (seat.heldUntil !== null && seat.heldUntil <= now) {
        await this.removeSeat(seat, `${seat.name} left`);
      }
    }
    if (
      this.openSockets().length === 0 &&
      meta.emptySince !== null &&
      now - meta.emptySince >= ROOM_IDLE_MS
    ) {
      this.meta = null;
      this.seats.clear();
      this.chat = [];
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.scheduleAlarm();
  }

  // ── Message handlers ─────────────────────────────────────────────────────

  private async onHello(ws: WebSocket, msg: Msg<"hello">): Promise<void> {
    const meta = this.meta!;
    const name = cleanText(msg.name, NAME_MAX);
    if (!name) return this.fail(ws, "name_invalid", true);

    let seat: Seat | undefined;
    let isHost = false;
    if (msg.resume) {
      const hash = await sha256(msg.resume);
      seat = [...this.seats.values()].find((s) => s.resumeHash === hash);
    }
    if (msg.hostKey) {
      if (!(await secretMatches(msg.hostKey, meta.hostKeyHash))) {
        return this.fail(ws, "bad_host_key", true);
      }
      isHost = true;
      seat ??= [...this.seats.values()].find((s) => s.host);
    }

    const nameTakenBy = (n: string) =>
      [...this.seats.values()].find((s) => s.name.toLowerCase() === n.toLowerCase());
    const joined = seat === undefined;

    if (seat) {
      // Reconnect: take the seat over and drop any older socket still attached to it.
      const other = nameTakenBy(name);
      if (!other || other.peer === seat.peer) seat.name = name;
      seat.heldUntil = null;
      for (const old of this.socketsOf(seat.peer)) {
        if (old !== ws) old.close(CLOSE_REPLACED, "replaced by a newer connection");
      }
    } else {
      if (!isHost && meta.locked) return this.fail(ws, "room_locked", true);
      const guests = [...this.seats.values()].filter((s) => !s.host).length;
      // One seat is always reserved for the host.
      if (!isHost && guests >= meta.players - 1) return this.fail(ws, "room_full", true);
      if (nameTakenBy(name)) return this.fail(ws, "name_taken", true);
      seat = {
        peer: newPeerId(),
        name,
        slot: this.freeSlot(isHost),
        ready: false,
        host: isHost,
        resumeHash: "",
        heldUntil: null,
      };
      this.seats.set(seat.peer, seat);
    }

    const resume = newSecret();
    seat.resumeHash = await sha256(resume);
    ws.serializeAttachment({ peer: seat.peer } satisfies Attachment);
    meta.emptySince = null;

    this.send(ws, {
      t: "welcome",
      peer: seat.peer,
      resume,
      room: this.state(),
      chat: this.chat,
    });
    if (joined) {
      await this.addChat("system", null, "", `${seat.name} joined`);
    }
    await this.persist();
    this.broadcastState(ws);
    await this.scheduleAlarm();
  }

  private async onSlot(ws: WebSocket, seat: Seat, msg: Msg<"slot">): Promise<void> {
    if (msg.slot !== null) {
      if (msg.slot > this.meta!.players) return this.fail(ws, "slot_unavailable");
      const holder = [...this.seats.values()].find((s) => s.slot === msg.slot);
      if (holder && holder.peer !== seat.peer) return this.fail(ws, "slot_taken");
    }
    if (seat.slot === msg.slot) return;
    seat.slot = msg.slot;
    seat.ready = false;
    await this.persist();
    this.broadcastState();
  }

  private async onReady(ws: WebSocket, seat: Seat, msg: Msg<"ready">): Promise<void> {
    if (msg.ready && seat.slot === null) return this.fail(ws, "slot_unavailable");
    if (seat.ready === msg.ready) return;
    seat.ready = msg.ready;
    await this.persist();
    this.broadcastState();
  }

  private async onChat(ws: WebSocket, seat: Seat, msg: Msg<"chat">): Promise<void> {
    const guard = this.guard(ws);
    const now = Date.now();
    if (now - guard.lastChat < LIMITS.chatMinIntervalMs) return this.notice(ws, guard, now);
    guard.lastChat = now;
    const text = cleanText(msg.text, CHAT_MAX);
    if (!text) return;
    await this.addChat("user", seat.peer, seat.name, text);
    await this.persist();
  }

  private async onKick(ws: WebSocket, seat: Seat, msg: Msg<"kick">): Promise<void> {
    if (!seat.host) return this.fail(ws, "not_host");
    const target = this.seats.get(msg.peer);
    if (!target || target.host) return this.fail(ws, "peer_not_found");
    for (const sock of this.socketsOf(target.peer)) {
      this.send(sock, { t: "kicked" });
      sock.close(CLOSE_KICKED, "removed by host");
    }
    await this.removeSeat(target, `${target.name} was removed by the host`);
  }

  private async onConfig(ws: WebSocket, seat: Seat, msg: Msg<"config">): Promise<void> {
    if (!seat.host) return this.fail(ws, "not_host");
    const seats = [...this.seats.values()];
    const highestSlot = Math.max(0, ...seats.map((s) => s.slot ?? 0));
    if (msg.players < seats.length || msg.players < highestSlot) {
      return this.fail(ws, "players_below_occupied");
    }
    this.meta!.players = msg.players;
    await this.persist();
    this.broadcastState();
  }

  private async onStream(ws: WebSocket, seat: Seat, msg: Msg<"stream">): Promise<void> {
    if (!seat.host) return this.fail(ws, "not_host");
    if (this.meta!.live === msg.live) return;
    this.meta!.live = msg.live;
    await this.persist();
    this.broadcastState();
  }

  private async onLock(ws: WebSocket, seat: Seat, msg: Msg<"lock">): Promise<void> {
    if (!seat.host) return this.fail(ws, "not_host");
    if (this.meta!.locked === msg.locked) return;
    this.meta!.locked = msg.locked;
    await this.addChat("system", null, "", msg.locked ? "The host locked the room" : "The host unlocked the room");
    await this.persist();
    this.broadcastState();
  }

  /** Relays WebRTC signaling between the host and one guest, never guest to guest. */
  private onSignal(ws: WebSocket, seat: Seat, msg: Msg<"sdp"> | Msg<"ice"> | Msg<"want-offer">): void {
    const target = this.seats.get(msg.to);
    const [targetSocket] = target ? this.socketsOf(target.peer) : [];
    if (!target || target.host === seat.host || !targetSocket) {
      return this.fail(ws, "peer_not_found");
    }
    if (msg.t === "sdp") {
      this.send(targetSocket, { t: "sdp", from: seat.peer, kind: msg.kind, sdp: msg.sdp });
    } else if (msg.t === "ice") {
      this.send(targetSocket, { t: "ice", from: seat.peer, cand: msg.cand });
    } else if (target.host) {
      this.send(targetSocket, { t: "want-offer", from: seat.peer });
    } else {
      this.fail(ws, "peer_not_found");
    }
  }

  /** Relays netplay data between the host and one guest, never guest to guest. Not stored. */
  private onNetplay(ws: WebSocket, seat: Seat, msg: Msg<"np">): void {
    const target = this.seats.get(msg.to);
    const [targetSocket] = target ? this.socketsOf(target.peer) : [];
    if (!target || target.host === seat.host || !targetSocket) return this.fail(ws, "peer_not_found");
    this.send(targetSocket, { t: "np", from: seat.peer, d: msg.d });
  }

  private async onGone(ws: WebSocket): Promise<void> {
    this.guards.delete(ws);
    const meta = this.meta;
    if (!meta) return;
    const peer = this.peerOf(ws);
    const seat = peer ? this.seats.get(peer) : undefined;
    if (seat && this.socketsOf(seat.peer).every((s) => s === ws)) {
      seat.heldUntil = Date.now() + LIMITS.seatGraceMs;
      if (seat.host) meta.live = false;
    }
    if (this.openSockets().every((s) => s === ws)) meta.emptySince = Date.now();
    await this.persist();
    this.broadcastState(ws);
    await this.scheduleAlarm();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private openSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN);
  }

  private peerOf(ws: WebSocket): string | null {
    return (ws.deserializeAttachment() as Attachment | null)?.peer ?? null;
  }

  private socketsOf(peer: string): WebSocket[] {
    return this.openSockets().filter((s) => this.peerOf(s) === peer);
  }

  private onlinePeers(): Set<string> {
    const peers = new Set<string>();
    for (const s of this.openSockets()) {
      const p = this.peerOf(s);
      if (p) peers.add(p);
    }
    return peers;
  }

  /**
   * The host gets P1 (they play on their own controller); guests fill P2 upward so
   * P1 stays free for a host who arrives late. Anyone can move to another free slot.
   */
  private freeSlot(forHost: boolean): Slot | null {
    const taken = new Set([...this.seats.values()].map((s) => s.slot));
    const open = SLOTS.filter((s) => s <= this.meta!.players && !taken.has(s));
    if (forHost) return open[0] ?? null;
    return open.find((s) => s !== 1) ?? open[0] ?? null;
  }

  private state(): RoomState {
    const meta = this.meta!;
    const online = this.onlinePeers();
    return {
      code: meta.code,
      players: meta.players,
      live: meta.live,
      locked: meta.locked,
      members: [...this.seats.values()].map((s) => ({
        peer: s.peer,
        name: s.name,
        slot: s.slot,
        ready: s.ready,
        host: s.host,
        online: online.has(s.peer),
      })),
    };
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket is closing; its close handler cleans up.
    }
  }

  /** Sends to every member who has said hello, except `skip`. */
  private broadcast(msg: ServerMsg, skip?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const s of this.openSockets()) {
      if (s === skip || !this.peerOf(s)) continue;
      try {
        s.send(text);
      } catch {
        // Ignore; handled on close.
      }
    }
  }

  private broadcastState(skip?: WebSocket): void {
    if (this.meta) this.broadcast({ t: "state", room: this.state() }, skip);
  }

  private async addChat(
    kind: ChatEntry["kind"],
    peer: string | null,
    name: string,
    text: string,
  ): Promise<void> {
    const meta = this.meta!;
    const entry: ChatEntry = { id: ++meta.chatSeq, kind, peer, name, text, ts: Date.now() };
    this.chat.push(entry);
    if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
    this.broadcast({ t: "chat", entry });
  }

  private async removeSeat(seat: Seat, notice: string): Promise<void> {
    this.seats.delete(seat.peer);
    if (seat.host) this.meta!.live = false;
    await this.addChat("system", null, "", notice);
    await this.persist();
    this.broadcastState();
    await this.scheduleAlarm();
  }

  private guard(ws: WebSocket): SocketGuard {
    let g = this.guards.get(ws);
    if (!g) {
      g = {
        general: new TokenBucket(LIMITS.general.capacity, LIMITS.general.perSecond),
        signal: new TokenBucket(LIMITS.signal.capacity, LIMITS.signal.perSecond),
        netplay: new TokenBucket(LIMITS.netplay.capacity, LIMITS.netplay.perSecond),
        lastChat: 0,
        strikes: [],
        lastNotice: 0,
      };
      this.guards.set(ws, g);
    }
    return g;
  }

  /** Drops over-budget messages; closes the socket only on sustained flooding. */
  private allow(ws: WebSocket, budget: "general" | "signal" | "netplay"): boolean {
    const guard = this.guard(ws);
    const now = Date.now();
    if (guard[budget].take(now)) return true;
    guard.strikes = guard.strikes.filter((t) => now - t < LIMITS.strikeWindowMs);
    guard.strikes.push(now);
    if (guard.strikes.length >= LIMITS.strikesToClose) {
      this.fail(ws, "rate_limited", true);
    } else {
      this.notice(ws, guard, now);
    }
    return false;
  }

  private notice(ws: WebSocket, guard: SocketGuard, now: number): void {
    if (now - guard.lastNotice < LIMITS.noticeIntervalMs) return;
    guard.lastNotice = now;
    this.send(ws, { t: "error", code: "rate_limited", fatal: false });
  }

  private fail(ws: WebSocket, code: ErrorCode, fatal = false): void {
    this.send(ws, { t: "error", code, fatal });
    if (fatal) ws.close(CLOSE_POLICY, code);
  }

  private async persist(): Promise<void> {
    if (!this.meta) return;
    await this.ctx.storage.put({
      meta: this.meta,
      seats: Object.fromEntries(this.seats),
      chat: this.chat,
    });
  }

  /** One alarm covers both held-seat expiry and idle-room deletion. */
  private async scheduleAlarm(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    const times: number[] = [];
    for (const s of this.seats.values()) if (s.heldUntil !== null) times.push(s.heldUntil);
    if (meta.emptySince !== null) times.push(meta.emptySince + ROOM_IDLE_MS);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
    else await this.ctx.storage.deleteAlarm();
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
