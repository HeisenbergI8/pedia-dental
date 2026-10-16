import { randomInt } from "node:crypto";

/** Readable at a glance and over the phone: no 0/O, 1/l/I. The mock's alphabet (apps/web/src/mocks/demo-accounts.ts). */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY23456789";
/** `randomInt` is a CSPRNG without modulo bias (the mock's `% length` has a little; it is a prototype). */
const pick = (n: number, chars: string) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");

/** "Kp7m-3xQa-9tLz": a new login's first password, shown once to the Owner and changed at first sign-in (decision #21). */
export const temporaryPassword = () => [pick(4, ALPHABET), pick(4, ALPHABET), pick(4, ALPHABET)].join("-");

/** A new login's Switch user PIN, shown once beside the temporary password (decision #24). */
export const newPin = () => pick(4, "0123456789");
