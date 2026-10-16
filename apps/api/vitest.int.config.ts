import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/int/support/database-url.ts";

/** `pnpm --filter api test:int`: the integration suite against a real MySQL test database (CONVENTIONS → Tests). */
export default defineConfig({
  test: {
    include: ["test/int/**/*.int.test.ts"],
    globalSetup: ["test/int/support/global-setup.ts"],
    fileParallelism: false, // one database, emptied by each test: files run one at a time
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, LOG_LEVEL: "silent" },
  },
});
