import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // test/int/** needs MySQL, so it runs only in `test:int` (CONVENTIONS → Traps: `pnpm run check` never needs MySQL).
    exclude: [...configDefaults.exclude, "test/int/**"],
  },
});
