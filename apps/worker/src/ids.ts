import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@reignroom/protocol";

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** 32-symbol alphabet, so masking a byte with 31 is unbiased. */
export function newRoomCode(): string {
  let code = "";
  for (const b of randomBytes(ROOM_CODE_LENGTH)) code += ROOM_CODE_ALPHABET[b & 31];
  return code;
}

/** Public id for a member: 9 bytes → 12 base64url chars. */
export function newPeerId(): string {
  return base64url(randomBytes(9));
}

/** Secret token: 32 bytes → 43 base64url chars. */
export function newSecret(): string {
  return base64url(randomBytes(32));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
}

/** Compares a presented secret with a stored hash without leaking timing. */
export async function secretMatches(secret: string, storedHash: string): Promise<boolean> {
  const a = new TextEncoder().encode(await sha256(secret));
  const b = new TextEncoder().encode(storedHash);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}
