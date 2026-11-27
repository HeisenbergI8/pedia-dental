import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("run.tf");
const originCheck = readFileSync(new URL("../../../apps/api/src/origin-check.ts", import.meta.url), "utf8");
const probePath = (probe: string) => tf.match(new RegExp(`${probe}\\s*\\{\\s*http_get\\s*\\{\\s*path\\s*=\\s*"([^"]+)"`))?.[1];

describe("run.tf (the API on Cloud Run)", () => {
  it("runs exactly one instance, always on, with CPU between requests (I8: the jobs and the outbox)", () => {
    expect(tf).toMatch(/min_instance_count\s*=\s*1/);
    expect(tf).toMatch(/max_instance_count\s*=\s*1/);
    expect(tf).toMatch(/cpu_idle\s*=\s*false/);
    expect(tf).toMatch(/BACKGROUND_WORK\s*=\s*"true"/);
  });

  it("starts on ready and checks liveness on live, both open to probes without the origin header (I9, #2)", () => {
    expect(probePath("startup_probe")).toBe("/api/health/ready");
    expect(probePath("liveness_probe")).toBe("/api/health/live");
    for (const path of [probePath("startup_probe"), probePath("liveness_probe")]) expect(originCheck).toContain(`"${path}"`);
  });

  it("drains well inside Cloud Run's 10 s between SIGTERM and SIGKILL", () => {
    const grace = Number(tf.match(/SHUTDOWN_GRACE_MS\s*=\s*"(\d+)"/)?.[1]);
    expect(grace).toBeGreaterThanOrEqual(0);
    expect(grace).toBeLessThanOrEqual(5000);
  });

  it("reads every secret from Secret Manager, never as plain text", () => {
    const plain = tf.match(/api_env = merge\(([\s\S]*?)\n  \)/)?.[1] ?? "";
    const secret = tf.match(/api_secrets = \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(plain).toContain("APP_ENV");
    for (const name of ["DB_PASSWORD", "ORIGIN_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      expect(secret).toMatch(new RegExp(`${name}\\s*=`));
      expect(plain).not.toContain(name);
    }
    expect(tf).toMatch(/version\s*=\s*"latest"/);
  });

  it("reaches Cloud Storage through its S3-compatible API and MySQL through the socket", () => {
    expect(tf).toMatch(/S3_ENDPOINT\s*=\s*"https:\/\/storage\.googleapis\.com"/);
    expect(tf).toContain("?socket=$DB_SOCKET");
    expect(tf).toMatch(/mount_path\s*=\s*"\/cloudsql"/);
  });

  it("leaves the image to the deploy workflow (I7)", () => {
    expect(tf).toMatch(/ignore_changes\s*=\s*\[template\[0\]\.containers\[0\]\.image/);
  });
});
