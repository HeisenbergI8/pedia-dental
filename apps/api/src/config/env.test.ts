import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db" })).toEqual({
      DATABASE_URL: "mysql://u:p@h/db",
      PORT: 4100,
      CORS_ORIGIN: "http://localhost:3000",
      LOG_LEVEL: "info",
      DEMO_LOGINS: false,
      COOKIE_SECURE: true,
      BACKGROUND_WORK: true,
      OUTBOX_POLL_MS: 2000,
      STORAGE_DIR: "var/storage",
    });
  });

  it("reads the two switches as booleans and refuses anything else", () => {
    const env = loadEnv({ DATABASE_URL: "mysql://u:p@h/db", DEMO_LOGINS: "true", COOKIE_SECURE: "false" });
    expect([env.DEMO_LOGINS, env.COOKIE_SECURE]).toEqual([true, false]);
    expect(() => loadEnv({ DATABASE_URL: "mysql://u:p@h/db", DEMO_LOGINS: "yes" })).toThrow(/DEMO_LOGINS/);
  });

  it("names every bad variable", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgres://x", PORT: "abc" })).toThrow(/DATABASE_URL[\s\S]*PORT/);
  });
});
