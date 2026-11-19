import { describe, expect, it } from "vitest";
import { PIN_POLICY, lockState, pinLockout } from "./pin";

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

  it("doubles the lock for each further wrong try, up to an hour (security review #9)", () => {
    // Five within the window lock 5 minutes; each later wrong try, once the lock has ended, locks for twice as long.
    const tries = [100, 99, 98, 97, 96, 90, 80, 60, 20].map(minutesAgo);
    expect(pinLockout(tries.slice(0, 6), NOW)).toEqual({ locked: false, attemptsLeft: 1 }); // 10-minute lock ended 80 minutes ago
    expect(pinLockout([...tries.slice(0, 6), minutesAgo(1)], NOW)).toEqual({ locked: true, until: new Date(NOW.getTime() + 19 * 60_000).toISOString() });
    expect(pinLockout([...tries, minutesAgo(0)], NOW)).toEqual({ locked: true, until: new Date(NOW.getTime() + 60 * 60_000).toISOString() }); // capped
  });

  it("keeps the escalation for a day, then forgets", () => {
    const morning = [5, 4, 3, 2, 1].map((m) => minutesAgo(12 * 60 + m)); // locked this morning, lock long over
    expect(pinLockout(morning, NOW)).toEqual({ locked: false, attemptsLeft: 1 });
    expect(pinLockout([...morning, minutesAgo(0)], NOW).locked).toBe(true); // one more wrong try locks again
    const yesterday = [5, 4, 3, 2, 1].map((m) => minutesAgo(25 * 60 + m));
    expect(pinLockout(yesterday, NOW)).toEqual({ locked: false, attemptsLeft: PIN_POLICY.maxFailures });
  });

  it("doesn't lock for wrong tries spread wider than the window", () => {
    expect(pinLockout([80, 60, 40, 20, 1].map(minutesAgo), NOW)).toEqual({ locked: false, attemptsLeft: PIN_POLICY.maxFailures - 1 });
  });

  it("counts two failures at the same moment twice", () => {
    const t = NOW.getTime() - 60_000;
    expect(lockState([t, t, t, t, t], NOW.getTime(), PIN_POLICY)).toEqual({ locked: true, until: t + 5 * 60_000 });
  });

  it("follows a different policy when given one", () => {
    const strict = { maxFailures: 2, windowMinutes: 15, lockMinutes: 30, maxLockMinutes: 60, memoryMinutes: 60 };
    expect(pinLockout([minutesAgo(2), minutesAgo(1)], NOW, strict).locked).toBe(true);
  });
});
