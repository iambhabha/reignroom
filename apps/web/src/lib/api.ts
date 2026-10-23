import {
  ApiError,
  CreateRoomRes,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomInfoRes,
  type ErrorCode,
  type PlayerCount,
} from "@reignroom/protocol";

export class ApiFailure extends Error {
  constructor(readonly code: ErrorCode | "network") {
    super(code);
  }
}

async function call<T>(path: string, parse: (v: unknown) => T, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiFailure("network");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = ApiError.safeParse(body);
    throw new ApiFailure(err.success ? err.data.error : "network");
  }
  return parse(body);
}

export function createRoom(players: PlayerCount): Promise<CreateRoomRes> {
  return call("/api/rooms", (v) => CreateRoomRes.parse(v), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players }),
  });
}

export function getRoomInfo(code: string): Promise<RoomInfoRes> {
  return call(`/api/rooms/${code}`, (v) => RoomInfoRes.parse(v));
}

const CODE_CHARS = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

/**
 * Accepts a typed code or a pasted invite link and returns the code text:
 * uppercased, characters that never appear in codes removed, at most 6 characters.
 */
export function normaliseCode(input: string): string {
  const fromLink = /\/r\/([A-Za-z0-9]{6})(?:[/?#]|$)/.exec(input)?.[1];
  return (fromLink ?? input).toUpperCase().replace(CODE_CHARS, "").slice(0, ROOM_CODE_LENGTH);
}

export function inviteLink(code: string): string {
  return `${location.origin}/r/${code}`;
}
