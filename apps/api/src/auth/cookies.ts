import type { CookieOptions } from "express";
import type { Env } from "../config/env";

/** Same names as the mock (apps/web/src/mocks/access.ts, mocks/operator.ts), so the web needs no change. */
export const SESSION_COOKIE = "pd_session";
export const BRANCH_COOKIE = "pd_branch";
export const OPERATOR_COOKIE = "pd_operator";

/** One cookie from a `Cookie` header. A malformed value reads as absent, never as an error. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq <= 0 || part.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1)) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * pd_session and pd_operator, for B2c's `res.cookie(...)`: httpOnly (no script can read it), SameSite=Lax, Secure
 * unless COOKIE_SECURE=false. No max-age: the browser keeps it for its session, and the server's idle and absolute
 * limits decide (SESSION_POLICY). pd_branch is written by the web app's script, so it is not httpOnly.
 */
export const sessionCookieOptions = (env: Pick<Env, "COOKIE_SECURE">): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.COOKIE_SECURE,
  path: "/",
});
