import { defineConfig } from "vitest/config";

// The seed lays out "today" in the clinic's zone, and seed.test.ts reads dates the same way (as the web's config did).
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], env: { TZ: "Asia/Manila" } },
});
