import { PIN_POLICY } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { Hasher, pinAttempt } from "./hashing";

const hasher = new Hasher();
const at = (iso: string) => new Date(iso);

describe("Hasher", () => {
  it("stores argon2id, never the secret, and checks it", async () => {
    const stored = await hasher.hash("pass123");
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain("pass123");
    expect(await hasher.matches(stored, "pass123")).toBe(true);
    expect(await hasher.matches(stored, "pass124")).toBe(false);
  });

  it("salts each hash, and treats a malformed stored hash as no match", async () => {
    expect(await hasher.hash("1234")).not.toBe(await hasher.hash("1234"));
    expect(await hasher.matches("not-a-hash", "1234")).toBe(false);
  });
});

describe("pinAttempt (PIN_POLICY: 5 wrong in 15 min lock for 5 min)", () => {
  const now = at("2026-10-16T02:00:00Z");
  const wrongs = (n: number) => Array.from({ length: n }, (_, i) => new Date(now.getTime() - (n - i) * 60_000).toISOString());

  it("records a wrong try and counts down", () => {
    const r = pinAttempt(wrongs(1), false, now);
    expect(r).toMatchObject({ outcome: "wrong", attemptsLeft: PIN_POLICY.maxFailures - 2 });
  });

  it("locks on the try that reaches the limit, then refuses even the right PIN", () => {
    const fifth = pinAttempt(wrongs(4), false, now);
    expect(fifth).toMatchObject({ outcome: "wrong", locked: { until: "2026-10-16T02:05:00.000Z" } });
    expect(pinAttempt(fifth.outcome === "wrong" ? fifth.failedAt : [], true, at("2026-10-16T02:01:00Z")).outcome).toBe("locked");
  });

  it("clears the tries on the right PIN, and drops tries older than the window", () => {
    expect(pinAttempt(wrongs(3), true, now)).toEqual({ outcome: "ok", failedAt: [] });
    const old = ["2026-10-16T01:00:00.000Z"];
    expect(pinAttempt(old, false, now)).toMatchObject({ failedAt: [now.toISOString()] });
  });
});
