import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("variables.tf");
const block = (name: string) => tf.match(new RegExp(`variable "${name}" \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("variables.tf", () => {
  it("keeps the data in Singapore", () => {
    expect(block("region")).toMatch(/default\s*=\s*"asia-southeast1"/);
    expect(block("region")).toMatch(/condition\s*=\s*var\.region == "asia-southeast1"/);
  });

  it("keeps config.ts's defaults: production, no demo logins, two proxy hops, the app user", () => {
    expect(block("app_env")).toMatch(/default\s*=\s*"production"/);
    expect(block("demo_logins")).toMatch(/default\s*=\s*false/);
    expect(block("trust_proxy_hops")).toMatch(/default\s*=\s*2/);
    expect(block("api_database_user")).toMatch(/default\s*=\s*"app"/);
    expect(block("alert_email")).toMatch(/default\s*=\s*"alerts@primolar\.ph"/);
  });

  it("refuses demo logins in production, as env.ts does", () => {
    expect(block("demo_logins")).toContain('!(var.demo_logins && var.app_env == "production")');
  });

  it("holds no secret: Terraform generates them", () => {
    expect(tf).not.toMatch(/variable "[^"]*(password|secret|key)[^"]*"/i);
  });
});
