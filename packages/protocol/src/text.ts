// Control characters (C0/C1) and invisible format characters such as bidi overrides
// and zero-width joiners, which can be used to spoof names or hide text.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Normalises user-supplied text for display as plain text.
 * HTML is never interpreted anywhere in ReignRoom; this only removes characters
 * that render invisibly or break layout, collapses whitespace and enforces a length.
 */
export function cleanText(input: string, max: number): string {
  return input
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .replace(UNSAFE, "")
    .trim()
    .slice(0, max);
}
