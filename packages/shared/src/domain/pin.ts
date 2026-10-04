/** Five wrong PINs within 15 minutes lock that person's PIN for 5 minutes. Data, not `if` statements. */
export const PIN_POLICY = { maxFailures: 5, windowMinutes: 15, lockMinutes: 5 };
export type PinPolicy = typeof PIN_POLICY;

export type PinLockState = { locked: true; until: string } | { locked: false; attemptsLeft: number };

const MINUTE = 60_000;

/**
 * Is this person's PIN locked, given their wrong tries? Locked from the try that reaches the limit until
 * `lockMinutes` after the latest wrong try. Once a lock ends, while the earlier tries are still inside the window,
 * each further wrong try locks again, so a guesser gets one try per lock period, not a fresh five.
 */
export function pinLockout(failedAt: readonly string[], now: Date, policy: PinPolicy = PIN_POLICY): PinLockState {
  const since = now.getTime() - policy.windowMinutes * MINUTE;
  const recent = failedAt.map((at) => Date.parse(at)).filter((t) => t > since);
  if (recent.length >= policy.maxFailures) {
    const until = Math.max(...recent) + policy.lockMinutes * MINUTE;
    if (until > now.getTime()) return { locked: true, until: new Date(until).toISOString() };
  }
  return { locked: false, attemptsLeft: Math.max(policy.maxFailures - recent.length, 1) };
}
