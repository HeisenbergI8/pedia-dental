import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("monitoring.tf");
const metrics = readFileSync(new URL("../../../apps/api/src/metrics/metrics.service.ts", import.meta.url), "utf8");

describe("monitoring.tf (I13 on Cloud Monitoring)", () => {
  it("counts the fields the API really writes (metrics.service.ts)", () => {
    for (const field of ["UnhandledErrors", "ConsoleSignIns", "OutboxOldestSeconds", "TextsHeldDailyCap"]) {
      expect(tf).toContain(`jsonPayload.${field}`);
      expect(metrics).toContain(`${field}:`);
    }
  });

  it("alarms on the same lines as AWS: any error, any console sign-in, the outbox over 10 minutes, any held text", () => {
    expect(tf).toContain("jsonPayload.UnhandledErrors>0");
    expect(tf).toContain("jsonPayload.ConsoleSignIns>0");
    expect(tf).toContain("jsonPayload.OutboxOldestSeconds>600");
    expect(tf).toContain("jsonPayload.TextsHeldDailyCap>0");
  });

  it("emails no 'closed' notice for a console sign-in", () => {
    expect(tf).toMatch(/name\s*=\s*"primolar-console-sign-in"[\s\S]*?prompts\s*=\s*\["OPENED"\]\s/);
  });

  it("emails a text held by the daily cap within the minute, with no 'closed' notice", () => {
    const alert = tf.match(/texts_held = \{([\s\S]*?)\n    \}/)?.[1] ?? "";
    expect(alert).toMatch(/name\s*=\s*"primolar-texts-held-daily-cap"/);
    expect(alert).toMatch(/window\s*=\s*"60s"/);
    expect(alert).toMatch(/prompts\s*=\s*\["OPENED"\]\s/);
  });

  it("alarms when the background instance stops reporting", () => {
    expect(tf).toMatch(/condition_absent\s*\{[\s\S]*?outbox_reports[\s\S]*?duration\s*=\s*"600s"/);
  });

  it("checks /api/health/ready over HTTPS and keeps logs 90 days", () => {
    expect(tf).toMatch(/path\s*=\s*"\/api\/health\/ready"/);
    expect(tf).toMatch(/validate_ssl\s*=\s*true/);
    expect(tf).toMatch(/retention_days\s*=\s*90/);
  });
});
