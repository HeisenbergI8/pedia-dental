import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Security review #8: the operator's two-step sign-in. RFC 6238 TOTP on RFC 4226 HOTP with node:crypto only:
 * HMAC-SHA1, a 30-second step, 6 digits, one step either side for clock drift. Any authenticator app reads the
 * otpauth URI the enrolment script prints (prisma/operator-totp.ts).
 */
export const TOTP = { stepSeconds: 30, digits: 6, window: 1, issuer: "Primolar" } as const;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding: how authenticator apps take a secret. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Undefined for anything that isn't base32 (spaces, dashes and padding are ignored, as apps do). */
export function base32Decode(text: string): Buffer | undefined {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) return undefined;
    value = ((value << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes (RFC 4226's recommended length for SHA-1), base32. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** The step a moment falls in. */
export const totpStep = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP.stepSeconds);

/** HOTP (RFC 4226 §5.3): the code for one counter. */
export function hotp(key: Buffer, counter: number, digits: number = TOTP.digits): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * The step a typed code matches, within one step either side of now, or undefined. Every candidate is compared in
 * constant time, and all of them are computed, so the time taken says nothing about which one matched. The caller
 * refuses a step it has already accepted (IdentityService.useTotpStep), so a code works once.
 */
export function matchTotp(secret: string, typed: string, now: Date): number | undefined {
  const key = base32Decode(secret);
  const code = typed.replace(/\s/g, "");
  if (!key || key.length === 0 || !/^\d{6}$/.test(code)) return undefined;
  const given = Buffer.from(code);
  const step = totpStep(now);
  let matched: number | undefined;
  for (let s = step - TOTP.window; s <= step + TOTP.window; s++) {
    if (timingSafeEqual(Buffer.from(hotp(key, s)), given) && matched === undefined) matched = s;
  }
  return matched;
}

/** What an authenticator app scans or takes as a link (Key URI Format): the issuer, the operator's email, the secret. */
export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`${TOTP.issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer: TOTP.issuer, algorithm: "SHA1", digits: String(TOTP.digits), period: String(TOTP.stepSeconds) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
