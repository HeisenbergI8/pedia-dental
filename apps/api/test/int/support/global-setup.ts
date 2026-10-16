import { execFileSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./database-url";

/** Before any file runs: the test database gets the committed migrations, exactly as `db:deploy` gives production. */
export default function setup() {
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
