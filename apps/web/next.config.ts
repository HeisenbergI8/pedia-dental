import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A production build beside a running `next dev` must not share its `.next` (they corrupt each other):
  // `NEXT_DIST_DIR=.next-build pnpm build`. Vercel builds alone and keeps the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@pedia/shared", "@pedia/seed"],
  // Dev and hybrid runs: `/api/*` goes to apps/api (API_PROXY_TARGET=http://localhost:4100), same-origin, so the API's
  // httpOnly cookies work without CORS. Unset (the MSW-only demo): no rewrite. The web has no /api routes of its own.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target ? [{ source: "/api/:path*", destination: `${target.replace(/\/$/, "")}/api/:path*` }] : [];
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
