/**
 * An escalating lock over someone's recent failures (wrong PINs, wrong passwords). Data, not `if` statements:
 * - `maxFailures` within `windowMinutes` lock for `lockMinutes`, from the failure that reaches the limit;
 * - once locked, every further failure (one is allowed when a lock ends) locks again for twice as long as the last
 *   lock, up to `maxLockMinutes`;
 * - failures older than `memoryMinutes` are forgotten, and a success clears the list (the caller's job).
 */
export type LockPolicy = { maxFailures: number; windowMinutes: number; lockMinutes: number; maxLockMinutes: number; memoryMinutes: number };

/**
 * Security review #9: five wrong PINs within 15 minutes lock that person's PIN for 5 minutes, then 10, 20, 40 and 60
 * for each further wrong try within a day. A session that guesses five wrong PINs is signed out (SESSION_WRONG_PINS).
 * PINs stay 4 digits (seeded PINs and the demo use them); the per-person lock and the per-session limit make guessing slow.
 */
export const PIN_POLICY: LockPolicy = { maxFailures: 5, windowMinutes: 15, lockMinutes: 5, maxLockMinutes: 60, memoryMinutes: 24 * 60 };
export type PinPolicy = LockPolicy;

/** Wrong PINs one signed-in session may make, across every person it tries, before it is signed out (security review #9). */
export const SESSION_WRONG_PINS = 5;

export type PinLockState = { locked: true; until: string } | { locked: false; attemptsLeft: number };
export type LockState = { locked: true; until: number } | { locked: false; attemptsLeft: number };

const MINUTE = 60_000;

/** The lock a list of failure times (ms) puts on someone at `now`. Pure; a time may repeat (two failures in one ms). */
export function lockState(failedAt: readonly number[], now: number, policy: LockPolicy): LockState {
  const remembered = failedAt.filter((t) => t > now - policy.memoryMinutes * MINUTE && t <= now).sort((a, b) => a - b);
  let locks = 0;
  let until = 0;
  remembered.forEach((t, i) => {
    const inWindow = remembered.slice(0, i + 1).filter((u) => u > t - policy.windowMinutes * MINUTE).length;
    if (locks === 0 && inWindow < policy.maxFailures) return;
    locks += 1;
    until = t + Math.min(policy.lockMinutes * 2 ** (locks - 1), policy.maxLockMinutes) * MINUTE;
  });
  if (until > now) return { locked: true, until };
  const recent = remembered.filter((t) => t > now - policy.windowMinutes * MINUTE).length;
  return { locked: false, attemptsLeft: locks > 0 ? 1 : Math.max(policy.maxFailures - recent, 1) };
}

/**
 * Is this person's PIN locked, given their wrong tries (ISO times)? Locked from the try that reaches the limit until
 * the lock period after the latest wrong try. Once a lock ends, each further wrong try locks again for twice as long,
 * so a guesser gets one try per lock period, not a fresh five, and the periods grow.
 */
export function pinLockout(failedAt: readonly string[], now: Date, policy: PinPolicy = PIN_POLICY): PinLockState {
  const state = lockState(failedAt.map((at) => Date.parse(at)), now.getTime(), policy);
  return state.locked ? { locked: true, until: new Date(state.until).toISOString() } : state;
}
