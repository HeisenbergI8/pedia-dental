import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file

/** The integration suite's database. Every test empties it, so it must be a throwaway `…_test` database. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "mysql://pedia:pedia@localhost:3307/pedia_dental_test";

if (!new URL(TEST_DATABASE_URL).pathname.endsWith("_test")) {
  throw new Error(`TEST_DATABASE_URL must name a database ending in _test; got ${new URL(TEST_DATABASE_URL).pathname}`);
}
