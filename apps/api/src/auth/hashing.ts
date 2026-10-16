import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { PIN_POLICY, pinLockout, type PinPolicy } from "@pedia/shared";

/**
 * Passwords and PINs are stored only as argon2id hashes (@node-rs/argon2's default algorithm, asserted in
 * hashing.test.ts). Injectable, so a test can swap in a fast fake; the parameters are the library's (19 MiB, t=2).
 */
@Injectable()
export class Hasher {
  hash(secret: string): Promise<string> {
    return hash(secret);
  }

  /** False for a wrong secret and for a malformed stored hash: a bad row never opens a login. */
  async matches(stored: string, secret: string): Promise<boolean> {
    try {
      return await verify(stored, secret);
    } catch {
      return false;
    }
  }
}

export type PinAttempt =
  | { outcome: "locked"; until: string }
  | { outcome: "wrong"; failedAt: string[]; locked?: { until: string }; attemptsLeft: number }
  | { outcome: "ok"; failedAt: [] };

/**
 * One PIN try against a person's recent wrong tries (`pinLockout`, domain/pin.ts): locked before the hash is even
 * checked, else wrong (the try is recorded, and may lock) or right (the tries are cleared). Pure: the caller stores
 * `failedAt` in the same transaction that read it (IdentityService.checkPin).
 */
export function pinAttempt(failedAt: readonly string[], correct: boolean, now: Date, policy: PinPolicy = PIN_POLICY): PinAttempt {
  const before = pinLockout(failedAt, now, policy);
  if (before.locked) return { outcome: "locked", until: before.until };
  if (correct) return { outcome: "ok", failedAt: [] };
  // Only tries inside the window are kept, so the stored list never grows without bound.
  const since = now.getTime() - policy.windowMinutes * 60_000;
  const kept = [...failedAt.filter((at) => Date.parse(at) > since), now.toISOString()];
  const after = pinLockout(kept, now, policy);
  return after.locked
    ? { outcome: "wrong", failedAt: kept, locked: { until: after.until }, attemptsLeft: 0 }
    : { outcome: "wrong", failedAt: kept, attemptsLeft: after.attemptsLeft };
}
