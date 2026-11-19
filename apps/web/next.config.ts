import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/** The API's origin when NEXT_PUBLIC_API_URL is absolute (a split deployment); same-origin `/api` otherwise. */
function apiOrigin(): string | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").origin;
  } catch {
    return undefined; // relative ("/api") or unset: covered by 'self'
  }
}

/**
 * The page's Content-Security-Policy (D #13).
 * - script-src: Next's App Router streams its RSC payload as inline `self.__next_f.push(…)` scripts whose text differs
 *   per page and per request, and layout.tsx adds THEME_SCRIPT. A hash can't cover the first, and a hash in the list
 *   makes browsers ignore 'unsafe-inline' (breaking the app); a nonce needs middleware and makes every page dynamic.
 *   So 'unsafe-inline' stays, and the rest of the policy still holds: no other origin's script, no plugins, no
 *   framing, no foreign `<base>` or form target. 'wasm-unsafe-eval': react-pdf's layout engine (yoga) is WebAssembly.
 *   'unsafe-eval' only in development, for webpack's eval source maps and Fast Refresh.
 * - img-src: blob: (the photo preview), data: (the PDF's logo drawn through a canvas), and https: because a photo or
 *   document read is a 302 from `/api/…/file` to a presigned link on the bucket's own host (B10).
 * - worker-src 'self' blob:: MSW's service worker (`/mockServiceWorker.js`) in offline and hybrid modes, and react-pdf's
 *   render worker (a blob: URL).
 * - font-src 'self': next/font self-hosts the Google fonts under /_next/static/media; react-pdf fetches /fonts/*.ttf.
 * - connect-src 'self': the API is same-origin through the `/api` rewrite (plus its origin if configured apart).
 */
function contentSecurityPolicy(): string {
  const api = apiOrigin();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", "https:"],
    "font-src": ["'self'", "data:"],
    // data: and blob: — react-pdf fetches its layout engine's WebAssembly from a data: URL; without it every PDF fails.
    "connect-src": ["'self'", "data:", "blob:", ...(api ? [api] : []), ...(dev ? ["ws:"] : [])],
    // blob: — react-pdf renders the PDF in a worker it creates from a blob: URL.
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/** Sent with every route (D #13). HSTS only from a production build: a dev server on http://localhost must not pin it. */
function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
  ];
}

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` (issue 39): it only tells a caller what to probe.
  poweredByHeader: false,
  // Every page and asset, but not the `/api` rewrite: the API sends its own (helmet, and the logo's sandbox CSP).
  async headers() {
    return [{ source: "/:path((?!api/).*)", headers: securityHeaders() }];
  },
  // A production build beside a running `next dev` must not share its `.next` (they corrupt each other):
  // `NEXT_DIST_DIR=.next-build pnpm build`. Vercel builds alone and keeps the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@pedia/shared", "@pedia/seed"],
  // `/api/*` goes to apps/api through src/middleware.ts (API_PROXY_TARGET), not a rewrite here: it must add the origin
  // secret's header, which a rewrite can't (#2).
  experimental: {
    // How much of a request body the proxy passes on (Next's default is 10 MB, which cut a 10 MB photo's form short and
    // the API answered 500). Must equal MAX_PROXY_BODY_BYTES in src/middleware.ts, which answers 413 above it (issue 16).
    // Vercel has its own request-body limit in front of this: check an 11 MB upload on the deployed site.
    middlewareClientMaxBodySize: 17 * 1024 * 1024,
  },
  webpack(config, { isServer }) {
    // MSW's browser worker has no server build. It's only loaded client-side
    // (see app/providers.tsx), so stub it out of the server bundle.
    if (isServer) {
      config.resolve.alias = { ...config.resolve.alias, "msw/browser": false };
    }
    return config;
  },
};

export default nextConfig;
