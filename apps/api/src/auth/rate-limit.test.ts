import { describe, expect, it } from "vitest";
import { RATE_LIMITS, bucketOf, groupOf, retryAfter, windowStart } from "./rate-limit";

describe("rate-limit policy", () => {
  it("counts both sign-in forms as login, and everything else under /auth as auth", () => {
    expect(groupOf("POST", "/auth/login")).toBe("login");
    expect(groupOf("POST", "/operator/auth/login")).toBe("login");
    expect(groupOf("GET", "/auth/me")).toBe("auth");
    expect(groupOf("POST", "/auth/switch")).toBe("auth");
  });

  it("puts every moment of a window in the same bucket, and the next moment in the next", () => {
    const a = windowStart(new Date("2026-10-16T02:04:59.999Z"), 300);
    expect(a.toISOString()).toBe("2026-10-16T02:00:00.000Z");
    expect(windowStart(new Date("2026-10-16T02:05:00.000Z"), 300).toISOString()).toBe("2026-10-16T02:05:00.000Z");
  });

  it("says how long until the window ends, never zero", () => {
    expect(retryAfter(new Date("2026-10-16T02:04:00Z"), RATE_LIMITS.login)).toBe(60);
    expect(retryAfter(new Date("2026-10-16T02:04:59.999Z"), RATE_LIMITS.login)).toBe(1);
  });

  it("allows 3 reset texts per sign-in value per hour, never routed by path (B11 decision 19)", () => {
    expect(RATE_LIMITS.reset).toEqual({ hits: 3, windowSeconds: 3600 });
    expect(groupOf("POST", "/auth/password-reset")).toBe("auth"); // the address limit still applies; the per-number one is PortalService's
  });

  it("allows 5 sign-ups and 10 sign-up receipts per address per rolling hour, counted by the service (B12 decision 14)", () => {
    expect(RATE_LIMITS.signup).toEqual({ hits: 5, windowSeconds: 3600 });
    expect(RATE_LIMITS.receipt).toEqual({ hits: 10, windowSeconds: 3600 });
    expect(bucketOf("signup", "203.0.113.9")).toBe("signup:203.0.113.9");
    expect(groupOf("POST", "/signups")).toBe("auth"); // never routed: /signups isn't an /auth route
  });

  it("keeps a bucket inside its column", () => {
    expect(bucketOf("login", "x".repeat(300))).toHaveLength(191);
  });
});
