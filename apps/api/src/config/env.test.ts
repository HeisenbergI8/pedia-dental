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
      SEMAPHORE_URL: "https://api.semaphore.co/api/v4/messages",
      S3_REGION: "ap-southeast-1",
      S3_FORCE_PATH_STYLE: false,
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

  it("takes B10's storage settings, and refuses a short link secret or a bad endpoint", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(() => loadEnv({ ...base, STORAGE_LINK_SECRET: "x".repeat(31) })).toThrow(/STORAGE_LINK_SECRET must be at least 32 characters/);
    expect(() => loadEnv({ ...base, S3_ENDPOINT: "not a url" })).toThrow(/S3_ENDPOINT/);
    expect(loadEnv({ ...base, S3_BUCKET: "primolar-files", S3_FORCE_PATH_STYLE: "true" })).toMatchObject({ S3_BUCKET: "primolar-files", S3_FORCE_PATH_STYLE: true });
  });
});
