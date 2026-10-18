import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/config";
import { EXAMPLE, exampleSettings } from "./support/settings";

const refusal = (overrides: Record<string, unknown>) => () => exampleSettings(overrides);

describe("infra settings", () => {
  it("fills the defaults (decisions.md I8, I11, I14, I18)", () => {
    expect(exampleSettings()).toMatchObject({
      appEnv: "production", demoLogins: false, trustProxyHops: 2, extraWebTasks: 0, monthlyBudgetUsd: 100,
      webOrigins: ["https://app.example.com"], certificateArn: undefined, semaphoreSecretArn: undefined,
    });
  });

  it("names every required setting that is missing or left empty in cdk.json", () => {
    const empty = { apiDomain: "", webOrigins: "", webUrl: "", alertEmail: "", githubRepo: "" };
    expect(() => settingsFrom((key) => (empty as Record<string, unknown>)[key])).toThrow(/apiDomain is not set[\s\S]*alertEmail is not set/);
    expect(refusal({ apiDomain: undefined })).toThrow(/apiDomain is not set/);
  });

  it("reads -c strings as cdk.json values: numbers, booleans, and '' as unset", () => {
    expect(exampleSettings({ trustProxyHops: "1", demoLogins: "true", appEnv: "demo", smsSenderName: "" }))
      .toMatchObject({ trustProxyHops: 1, demoLogins: true, smsSenderName: undefined });
  });

  it("refuses what the API refuses at startup", () => {
    expect(refusal({ webOrigins: "http://app.example.com" })).toThrow(/https origin/);
    expect(refusal({ webOrigins: "https://app.example.com/" })).toThrow(/https origin/);
    expect(refusal({ webUrl: "http://app.example.com" })).toThrow(/webUrl/);
    expect(refusal({ demoLogins: true })).toThrow(/demoLogins can't be true with appEnv=production/);
    expect(refusal({ trustProxyHops: 4 })).toThrow(/trustProxyHops/);
    expect(refusal({ smsSenderName: "PRIMOLAR-CLINICS" })).toThrow(/smsSenderName/);
  });

  it("keeps webUrl among the CORS origins and the domain a bare host", () => {
    expect(refusal({ webUrl: "https://other.example.com" })).toThrow(/webUrl's origin must be one of webOrigins/);
    expect(refusal({ apiDomain: "https://api.example.com" })).toThrow(/host name/);
    expect(exampleSettings({ webOrigins: "https://app.example.com, https://www.example.com" }).webOrigins).toHaveLength(2);
  });

  it("refuses a malformed ARN rather than failing at deploy", () => {
    expect(refusal({ semaphoreSecretArn: "primolar/semaphore" })).toThrow(/semaphoreSecretArn/);
    expect(refusal({ certificateArn: "abc" })).toThrow(/certificateArn/);
    expect(refusal({ githubRepo: EXAMPLE.githubRepo + "/extra" })).toThrow(/owner\/name/);
  });
});
