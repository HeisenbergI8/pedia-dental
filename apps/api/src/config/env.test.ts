import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db" })).toEqual({
      DATABASE_URL: "mysql://u:p@h/db",
      PORT: 4100,
      APP_ENV: "local",
      CORS_ORIGIN: ["http://localhost:3000"],
      TRUST_PROXY_HOPS: 0,
      METRICS_INTERVAL_S: 0,
      LOG_LEVEL: "info",
      DEMO_LOGINS: false,
      COOKIE_SECURE: true,
      BACKGROUND_WORK: true,
      OUTBOX_POLL_MS: 2000,
      STORAGE_DIR: "var/storage",
      SEMAPHORE_URL: "https://api.semaphore.co/api/v4/messages",
      WEB_URL: "http://localhost:3000",
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

  it("splits CORS_ORIGIN into exact origins, refusing a path, a trailing slash or *", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, CORS_ORIGIN: "https://a.example, https://b.example" }).CORS_ORIGIN).toEqual(["https://a.example", "https://b.example"]);
    for (const bad of ["https://a.example/", "*", "https://a.example/app", ""]) expect(() => loadEnv({ ...base, CORS_ORIGIN: bad }), bad).toThrow(/CORS_ORIGIN/);
  });

  it("refuses dev defaults in a hosted deployment (B13a)", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(() => loadEnv({ ...base, APP_ENV: "production" })).toThrow(/CORS_ORIGIN[\s\S]*WEB_URL[\s\S]*S3_BUCKET/);
    const hosted = { ...base, CORS_ORIGIN: "https://app.primolar.ph", WEB_URL: "https://app.primolar.ph", S3_BUCKET: "primolar-files" };
    expect(loadEnv({ ...hosted, APP_ENV: "production" }).APP_ENV).toBe("production");
    expect(() => loadEnv({ ...hosted, APP_ENV: "production", DEMO_LOGINS: "true" })).toThrow(/DEMO_LOGINS/);
    expect(loadEnv({ ...hosted, APP_ENV: "demo", DEMO_LOGINS: "true" }).DEMO_LOGINS).toBe(true);
    expect(() => loadEnv({ ...hosted, APP_ENV: "demo", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
  });

  it("takes 0–3 proxy hops", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: "4" })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
