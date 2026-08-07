import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Prefixed, URL-safe, sortable-enough IDs: "mtg_x7k2..." etc.
 * Prefixes make IDs self-describing in logs and API responses.
 */
export function newId(prefix: string, length = 20): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return `${prefix}_${out}`;
}
