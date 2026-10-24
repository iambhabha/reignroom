/** Room socket limits. Tuned so a normal join (offer + ICE trickle) never trips them. */
export const LIMITS = {
  /** Lobby messages: slot, ready, chat, kick, config, stream. */
  general: { capacity: 30, perSecond: 10 },
  /**
   * WebRTC signaling (`sdp` and `ice`). A host connecting three guests sends about
   * 3 × (1 offer + 10–30 candidates) in a burst, plus renegotiations later.
   */
  signal: { capacity: 200, perSecond: 50 },
  /**
   * Netplay relay (`np`). A player sends a bundle about every 33 ms (two frames of input),
   * plus a ping and a memory hash each second: ~32/s. Room for catch-up bursts.
   */
  netplay: { capacity: 240, perSecond: 80 },
  chatMinIntervalMs: 500,
  /** Dropped messages within the window before the socket is closed. */
  strikesToClose: 50,
  strikeWindowMs: 10_000,
  /** At most one rate_limited notice per socket per this interval. */
  noticeIntervalMs: 1_000,
  maxMessageChars: 48_000,
  /** Sockets per room, including ones that have not said hello yet. */
  maxSockets: 12,
  /** How long a disconnected member's seat is held for them to resume. */
  seatGraceMs: 60_000,
} as const;

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    now = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
