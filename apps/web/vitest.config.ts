import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Node's fetch rejects relative URLs, so handler tests need an absolute API base.
    env: { NEXT_PUBLIC_API_URL: "http://localhost/api" },
  },
});
