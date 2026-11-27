import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("release.tf");

describe("release.tf (B13a E4, #34)", () => {
  it("sets up the app user, then migrates, and stops at the first failure", () => {
    const setup = tf.indexOf("prisma db execute --stdin");
    const migrate = tf.indexOf("prisma migrate deploy");
    expect(setup).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(setup);
    expect(tf).toMatch(/join\(" && "/);
    expect(tf).toMatch(/max_retries\s*=\s*0/);
  });

  it("grants the app user DML only, and DROP only to a demo with the nightly reset", () => {
    expect(tf).toContain('var.demo_daily_reset ? "SELECT, INSERT, UPDATE, DELETE, DROP" : "SELECT, INSERT, UPDATE, DELETE"');
  });

  it("signs in as the master user, whose password only this job reads", () => {
    expect(tf).toMatch(/name\s*=\s*"DB_USER"\s*value\s*=\s*local\.names\.database_user/);
    expect(tf).toContain('generated["database"]');
  });

  it("leaves the image to the deploy workflow", () => {
    expect(tf).toMatch(/ignore_changes\s*=\s*\[template\[0\]\.template\[0\]\.containers\[0\]\.image/);
  });
});
