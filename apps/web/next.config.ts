import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source; Next compiles it.
  transpilePackages: ["@pedia/shared"],
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
