import { randomInt } from "node:crypto";

// No 0/O, 1/I/L, so codes survive being read aloud or copied by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCompanyCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// Accepts "abcd efgh", "ABCD-EFGH", "abcdefgh" and returns "ABCD-EFGH", or null.
export function normalizeCompanyCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8) return null;
  for (const ch of raw) if (!ALPHABET.includes(ch)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
