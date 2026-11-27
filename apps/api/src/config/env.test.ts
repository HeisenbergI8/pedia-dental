import { describe, expect, it } from "vitest";
import { loadScriptEnv, loadEnv } from "./env";

describe("loadEnv", () => {
  it("drains 12 s after SIGTERM by default, and takes Cloud Run's shorter time", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, SHUTDOWN_GRACE_MS: "1000" }).SHUTDOWN_GRACE_MS).toBe(1000);
    expect(() => loadEnv({ ...base, SHUTDOWN_GRACE_MS: "30000" })).toThrow(/SHUTDOWN_GRACE_MS is at most 25000/);
  });

  it("applies defaults", () => {
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db" })).toEqual({
      DATABASE_URL: "mysql://u:p@h/db",
      PORT: 4100,
      APP_ENV: "local",
      CORS_ORIGIN: ["http://localhost:3000"],
      TRUST_PROXY_HOPS: 0,
      METRICS_INTERVAL_S: 0,
      SHUTDOWN_GRACE_MS: 12_000,
      LOG_LEVEL: "info",
      DEMO_LOGINS: false,
      DEMO_DAILY_RESET: false,
      COOKIE_SECURE: true,
      BACKGROUND_WORK: true,
      OUTBOX_POLL_MS: 2000,
      STORAGE_DIR: "var/storage",
      SEMAPHORE_URL: "https://api.semaphore.co/api/v4/messages",
      WEB_URL: "http://localhost:3000",
      S3_REGION: "ap-southeast-1",
      S3_FORCE_PATH_STYLE: false,
      PRIVACY_REQUEST_DUE_WORKING_DAYS: 15,
      RETENTION_ERASURE: false,
    });
  });

  it("refuses RETENTION_ERASURE=true while the retention periods are unconfirmed (B13c2b-2, confirm with counsel)", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, RETENTION_ERASURE: "false" }).RETENTION_ERASURE).toBe(false);
    expect(() => loadEnv({ ...base, RETENTION_ERASURE: "true" })).toThrow(/RETENTION_ERASURE.*unconfirmed/);
    expect(() => loadEnv({ ...base, RETENTION_ERASURE: "yes" })).toThrow(/RETENTION_ERASURE/);
  });

  it("takes the request deadline in working days, 1 to 60, default 15 (B13c2b, confirm with counsel)", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, PRIVACY_REQUEST_DUE_WORKING_DAYS: "10" }).PRIVACY_REQUEST_DUE_WORKING_DAYS).toBe(10);
    expect(() => loadEnv({ ...base, PRIVACY_REQUEST_DUE_WORKING_DAYS: "0" })).toThrow();
    expect(() => loadEnv({ ...base, PRIVACY_REQUEST_DUE_WORKING_DAYS: "90" })).toThrow(/at most 60/);
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
    const hosted = { ...base, CORS_ORIGIN: "https://app.primolar.ph", WEB_URL: "https://app.primolar.ph", S3_BUCKET: "primolar-files", ORIGIN_SECRET: "o".repeat(32) };
    expect(loadEnv({ ...hosted, APP_ENV: "production" }).APP_ENV).toBe("production");
    expect(() => loadEnv({ ...hosted, APP_ENV: "production", DEMO_LOGINS: "true" })).toThrow(/DEMO_LOGINS/);
    expect(loadEnv({ ...hosted, APP_ENV: "demo", DEMO_LOGINS: "true" }).DEMO_LOGINS).toBe(true);
    expect(() => loadEnv({ ...hosted, APP_ENV: "demo", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
  });

  it("allows the nightly demo reset only on a demo deployment with demo logins (B13c1)", () => {
    const hosted = { DATABASE_URL: "mysql://u:p@h/db", CORS_ORIGIN: "https://demo.primolar.ph", WEB_URL: "https://demo.primolar.ph", S3_BUCKET: "primolar-demo", ORIGIN_SECRET: "o".repeat(32) };
    expect(loadEnv({ ...hosted, APP_ENV: "demo", DEMO_LOGINS: "true", DEMO_DAILY_RESET: "true" }).DEMO_DAILY_RESET).toBe(true);
    expect(() => loadEnv({ ...hosted, APP_ENV: "demo", DEMO_DAILY_RESET: "true" })).toThrow(/DEMO_DAILY_RESET/);
    expect(() => loadEnv({ ...hosted, APP_ENV: "production", DEMO_DAILY_RESET: "true" })).toThrow(/DEMO_DAILY_RESET/);
    expect(() => loadEnv({ DATABASE_URL: "mysql://u:p@h/db", DEMO_LOGINS: "true", DEMO_DAILY_RESET: "true" })).toThrow(/DEMO_DAILY_RESET/);
  });

  it("fails closed: NODE_ENV=production refuses APP_ENV unset or local", () => {
    const hosted = { DATABASE_URL: "mysql://u:p@h/db", CORS_ORIGIN: "https://app.primolar.ph", WEB_URL: "https://app.primolar.ph", S3_BUCKET: "primolar-files", ORIGIN_SECRET: "o".repeat(64) };
    expect(() => loadEnv({ ...hosted, NODE_ENV: "production" })).toThrow(/APP_ENV must be demo or production/);
    expect(() => loadEnv({ ...hosted, NODE_ENV: "production", APP_ENV: "local" })).toThrow(/APP_ENV must be demo or production/);
    expect(loadEnv({ ...hosted, NODE_ENV: "production", APP_ENV: "production" }).APP_ENV).toBe("production");
    expect(loadEnv({ ...hosted, NODE_ENV: "production", APP_ENV: "demo" }).APP_ENV).toBe("demo");
    // Other variables' problems are still named alongside it.
    expect(() => loadEnv({ DATABASE_URL: "postgres://x", NODE_ENV: "production" })).toThrow(/DATABASE_URL[\s\S]*APP_ENV/);
    // Local development and tests keep the local default.
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db", NODE_ENV: "development" }).APP_ENV).toBe("local");
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db", NODE_ENV: "test" }).APP_ENV).toBe("local");
  });

  it("requires an https:// SEMAPHORE_URL outside APP_ENV=local", () => {
    const hosted = { DATABASE_URL: "mysql://u:p@h/db", CORS_ORIGIN: "https://app.primolar.ph", WEB_URL: "https://app.primolar.ph", S3_BUCKET: "primolar-files", ORIGIN_SECRET: "o".repeat(64) };
    expect(() => loadEnv({ ...hosted, APP_ENV: "production", SEMAPHORE_URL: "http://api.semaphore.co/api/v4/messages" })).toThrow(/SEMAPHORE_URL must be an https/);
    expect(() => loadEnv({ ...hosted, APP_ENV: "demo", SEMAPHORE_URL: "http://api.semaphore.co/api/v4/messages" })).toThrow(/SEMAPHORE_URL/);
    expect(loadEnv({ ...hosted, APP_ENV: "production" }).SEMAPHORE_URL).toBe("https://api.semaphore.co/api/v4/messages");
    // A local fake (e.g. a mock server) may stay on http.
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db", SEMAPHORE_URL: "http://127.0.0.1:9999/messages" }).SEMAPHORE_URL).toBe("http://127.0.0.1:9999/messages");
  });

  it("requires an origin secret of 32+ characters outside APP_ENV=local (#2)", () => {
    const hosted = { DATABASE_URL: "mysql://u:p@h/db", CORS_ORIGIN: "https://app.primolar.ph", WEB_URL: "https://app.primolar.ph", S3_BUCKET: "primolar-files" };
    expect(() => loadEnv({ ...hosted, APP_ENV: "production" })).toThrow(/ORIGIN_SECRET is required outside APP_ENV=local/);
    expect(() => loadEnv({ ...hosted, APP_ENV: "demo", ORIGIN_SECRET: "o".repeat(31) })).toThrow(/ORIGIN_SECRET must be at least 32 characters/);
    expect(loadEnv({ ...hosted, APP_ENV: "production", ORIGIN_SECRET: "o".repeat(64) }).ORIGIN_SECRET).toHaveLength(64);
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db" }).ORIGIN_SECRET).toBeUndefined(); // local: no lock
  });

  it("takes 0–3 proxy hops", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv({ ...base, TRUST_PROXY_HOPS: "1" }).TRUST_PROXY_HOPS).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: "4" })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("keeps the operator trail forever unless a period of a year or more is set (B13c2a)", () => {
    const base = { DATABASE_URL: "mysql://u:p@h/db" };
    expect(loadEnv(base).OPERATOR_AUDIT_KEEP_DAYS).toBeUndefined();
    expect(loadEnv({ ...base, OPERATOR_AUDIT_KEEP_DAYS: "1826" }).OPERATOR_AUDIT_KEEP_DAYS).toBe(1826);
    expect(() => loadEnv({ ...base, OPERATOR_AUDIT_KEEP_DAYS: "30" })).toThrow(/at least 365/);
  });

  it("lets a one-off script run without the web-facing settings, never as local (security review #8 follow-up)", () => {
    const task = { DATABASE_URL: "mysql://u:p@h/db", APP_ENV: "production", NODE_ENV: "production" };
    expect(() => loadEnv(task)).toThrow(/ORIGIN_SECRET/);
    expect(() => loadScriptEnv(task)).toThrow(/S3_BUCKET/); // a script that stores files still needs the bucket
    const env = loadScriptEnv(task, { storage: false });
    expect([env.APP_ENV, env.BACKGROUND_WORK]).toEqual(["production", false]);
    expect(() => loadScriptEnv({ DATABASE_URL: "mysql://u:p@h/db", NODE_ENV: "production" }, { storage: false })).toThrow(/APP_ENV/);
  });
});
