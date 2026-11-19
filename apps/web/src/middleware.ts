import { type NextRequest, NextResponse } from "next/server";

/** #2: the API (and its load balancer) answer only requests carrying this header, set from the server-only ORIGIN_SECRET. */
export const ORIGIN_HEADER = "x-primolar-origin";

/**
 * The web's `/api` proxy. `/api/*` goes to apps/api (API_PROXY_TARGET, e.g. http://localhost:4100 or
 * https://<apiDomain>), same-origin, so the API's httpOnly cookies work without CORS. The web has no /api routes of its
 * own. A middleware rather than a next.config rewrite because a rewrite can't add a request header: this one adds the
 * origin secret (Vercel env ORIGIN_SECRET), without which the deployed API refuses the request (403). Unset
 * API_PROXY_TARGET (the MSW-only demo): no proxy. Unset ORIGIN_SECRET (local): no header, and the local API checks none.
 */
export function middleware(request: NextRequest) {
  const target = process.env.API_PROXY_TARGET;
  if (!target) return NextResponse.next();
  const url = new URL(`${target.replace(/\/$/, "")}${request.nextUrl.pathname}${request.nextUrl.search}`);
  const headers = new Headers(request.headers);
  headers.delete(ORIGIN_HEADER); // never a caller's own
  const secret = process.env.ORIGIN_SECRET;
  if (secret) headers.set(ORIGIN_HEADER, secret);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = { matcher: "/api/:path*" };
