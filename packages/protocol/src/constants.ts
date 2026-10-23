/** Bumped on any breaking change to the signaling messages. */
export const PROTOCOL_VERSION = 1;

/**
 * Room code alphabet: A–Z and 2–9 without the look-alikes I, O, 0 and 1.
 * 32 symbols, so a random byte masked with 31 maps onto it without bias.
 * 6 characters → 32^6 ≈ 1.07 billion codes.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export const NAME_MAX = 20;
export const CHAT_MAX = 300;
/** Chat messages kept per room and sent to people who join later. */
export const CHAT_HISTORY = 50;

export const SLOTS = [1, 2, 3, 4] as const;
export type Slot = (typeof SLOTS)[number];

export const PLAYER_COUNTS = [2, 3, 4] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];
export const DEFAULT_PLAYERS: PlayerCount = 2;

/** A room with no connected members and no activity for this long is deleted. */
export const ROOM_IDLE_MS = 30 * 60 * 1000;
