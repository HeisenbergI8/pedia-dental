import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("budget.tf");

describe("budget.tf (I14)", () => {
  it("emails at 80% of actual spend and 100% of forecast, as on AWS", () => {
    expect(tf).toMatch(/threshold_percent\s*=\s*0\.8\s*spend_basis\s*=\s*"CURRENT_SPEND"/);
    expect(tf).toMatch(/threshold_percent\s*=\s*1\.0\s*spend_basis\s*=\s*"FORECASTED_SPEND"/);
  });

  it("counts the real cost, not what is left after the trial's credits", () => {
    expect(tf).toMatch(/credit_types_treatment\s*=\s*"EXCLUDE_ALL_CREDITS"/);
  });

  it("emails the alert channel", () => {
    expect(tf).toContain("google_monitoring_notification_channel.email.id");
  });
});
