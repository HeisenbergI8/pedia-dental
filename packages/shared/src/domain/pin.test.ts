import { describe, expect, it } from "vitest";
import { PIN_POLICY, pinLockout } from "./pin";

const NOW = new Date("2026-10-03T09:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("pinLockout", () => {
  it("allows the full number of tries with no wrong ones", () => {
    expect(pinLockout([], NOW)).toEqual({ locked: false, attemptsLeft: PIN_POLICY.maxFailures });
  });

  it("counts down with each recent wrong try", () => {
    expect(pinLockout([minutesAgo(3), minutesAgo(2), minutesAgo(1), minutesAgo(0.5)], NOW)).toEqual({ locked: false, attemptsLeft: 1 });
  });

  it("locks on the fifth wrong try, until five minutes after the latest", () => {
    const tries = [5, 4, 3, 2, 1].map(minutesAgo);
    expect(pinLockout(tries, NOW)).toEqual({ locked: true, until: new Date(NOW.getTime() + 4 * 60_000).toISOString() });
  });

  it("unlocks when the lock period ends, with one try before it locks again", () => {
    const tries = [12, 11, 10, 9, 8].map(minutesAgo); // latest 8 minutes ago, so the 5-minute lock ended 3 minutes ago
    expect(pinLockout(tries, NOW)).toEqual({ locked: false, attemptsLeft: 1 });
    expect(pinLockout([...tries, minutesAgo(0)], NOW).locked).toBe(true);
  });

  it("forgets wrong tries older than the window", () => {
    expect(pinLockout([20, 19, 18, 17, 16].map(minutesAgo), NOW)).toEqual({ locked: false, attemptsLeft: PIN_POLICY.maxFailures });
  });

  it("follows a different policy when given one", () => {
    const strict = { maxFailures: 2, windowMinutes: 15, lockMinutes: 30 };
    expect(pinLockout([minutesAgo(2), minutesAgo(1)], NOW, strict).locked).toBe(true);
  });
});
