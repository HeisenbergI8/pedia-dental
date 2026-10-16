import { describe, expect, it } from "vitest";
import { readCookie } from "./cookies";
import { SESSION_POLICY, hashToken, sessionExpiry } from "./session.service";

const t0 = new Date("2026-10-16T00:00:00Z");
const plus = (min: number) => new Date(t0.getTime() + min * 60_000);
const session = (lastSeenMin: number) => ({ createdAt: t0, lastSeenAt: plus(lastSeenMin), expiresAt: plus(SESSION_POLICY.absoluteHours * 60) });

describe("sessionExpiry (30 min idle, 8 h absolute)", () => {
  it("opens within 30 idle minutes, and not at 30", () => {
    expect(sessionExpiry(session(0), plus(29))).toBeUndefined();
    expect(sessionExpiry(session(0), plus(30))).toBe("idle");
  });
  it("ends at 8 h however recently it was used", () => {
    expect(sessionExpiry(session(479), plus(479.5))).toBeUndefined();
    expect(sessionExpiry(session(479), plus(480))).toBe("absolute");
  });
});

describe("tokens and cookies", () => {
  it("stores a 64-hex SHA-256, never the token", () => {
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
  it("reads one cookie, and a malformed one as absent", () => {
    expect(readCookie("a=1; pd_session=tok%2Fen; pd_branch=branch_imus", "pd_session")).toBe("tok/en");
    expect(readCookie("pd_session=%E0%A4%A", "pd_session")).toBeUndefined();
    expect(readCookie("xpd_session=1", "pd_session")).toBeUndefined();
    expect(readCookie(undefined, "pd_branch")).toBeUndefined();
  });
});
