import { type NextRequest, NextResponse } from "next/server";

/** #2: the API (and its load balancer) answer only requests carrying this header, set from the server-only ORIGIN_SECRET. */
export const ORIGIN_HEADER = "x-primolar-origin";

/**
 * The most the proxy reads of a request body (next.config.ts sets `middlewareClientMaxBodySize` to this). The largest
 * real upload is a sign-up: a 1 MB logo and three 5 MB reference images, 16 MB, plus the form around them. Anything up
 * to this reaches the API whole, so a 10 MB + 1 byte photo gets the API's own 413 and message. Above it Next would cut
 * the body short and the API would fail on a broken form (a bare 500), so the proxy answers 413 itself.
 */
export const MAX_PROXY_BODY_BYTES = 17 * 1024 * 1024;
export const BODY_TOO_LARGE = "Files must be under 10 MB";

/**
 * The web's `/api` proxy. `/api/*` goes to apps/api (API_PROXY_TARGET, e.g. http://localhost:4100 or
 * https://<apiDomain>), same-origin, so the API's httpOnly cookies work without CORS. The web has no /api routes of its
 * own. A middleware rather than a next.config rewrite because a rewrite can't add a request header: this one adds the
 * origin secret (Vercel env ORIGIN_SECRET), without which the deployed API refuses the request (403). Unset
 * API_PROXY_TARGET (the MSW-only demo): no proxy. Unset ORIGIN_SECRET (local): no header, and the local API checks none.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return proxy(request);
  return consoleHost(request);
}

/**
 * Primolar's console lives on its own address (OPS_HOST, e.g. ops.primolar.ph): there every page but the console sends
 * you to it, and the clinic app's address answers 404 for /operator. The API still refuses anyone without an operator
 * session; this only keeps the console out of the clinics' sight. Unset OPS_HOST (local, previews): no change.
 */
function consoleHost(request: NextRequest) {
  const opsHost = process.env.OPS_HOST;
  if (!opsHost) return NextResponse.next();
  const { pathname } = request.nextUrl;
  // The Host header, not nextUrl: under `next start` nextUrl's host is the server's own, whatever address was asked for.
  const asked = request.headers.get("host") ?? request.nextUrl.host;
  const onOps = asked.split(":")[0] === opsHost;
  const isConsole = pathname === "/operator" || pathname.startsWith("/operator/");
  if (onOps && !isConsole) return NextResponse.redirect(new URL("/operator", `${request.nextUrl.protocol}//${asked}`));
  if (!onOps && isConsole) return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const res = NextResponse.next();
  if (onOps) res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

function proxy(request: NextRequest) {
  const target = process.env.API_PROXY_TARGET;
  if (!target) return NextResponse.next();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PROXY_BODY_BYTES) {
    return new NextResponse(BODY_TOO_LARGE, { status: 413, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const url = new URL(`${target.replace(/\/$/, "")}${request.nextUrl.pathname}${request.nextUrl.search}`);
  const headers = new Headers(request.headers);
  headers.delete(ORIGIN_HEADER); // never a caller's own
  const secret = process.env.ORIGIN_SECRET;
  if (secret) headers.set(ORIGIN_HEADER, secret);
  setClientAddress(request, headers);
  return NextResponse.rewrite(url, { request: { headers } });
}

/**
 * Issue 17: the API's per-address rate limits read X-Forwarded-For, so it must never be the caller's own. On Vercel
 * it's rebuilt from `x-real-ip`, which Vercel sets to the connecting client (overwriting any the caller sent). Anywhere
 * else (local `next dev` / `next start`) a middleware can't see the socket address, so the header is dropped and the
 * API counts the proxy's own address: one bucket for every caller, which none can step out of.
 */
function setClientAddress(request: NextRequest, headers: Headers): void {
  headers.delete("x-forwarded-for");
  const client = process.env.VERCEL ? request.headers.get("x-real-ip")?.trim() : undefined;
  if (client) headers.set("x-forwarded-for", client);
}

// The /api proxy, plus every page (not Next's own files or anything with a file extension) for the console's address.
export const config = { matcher: ["/api/:path*", "/((?!_next/|.*\\..*).*)"] };
