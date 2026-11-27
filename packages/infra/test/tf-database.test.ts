import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("database.tf");

describe("database.tf (I3 on Cloud SQL)", () => {
  it("runs MySQL 8.4, the version CI tests against (api.yml)", () => {
    expect(tf).toMatch(/database_version\s*=\s*"MYSQL_8_4"/);
  });

  it("can't be deleted by Terraform or by Google", () => {
    expect(tf).toMatch(/^\s*deletion_protection\s*=\s*true/m);
    expect(tf).toMatch(/deletion_protection_enabled\s*=\s*true/);
  });

  it("keeps 30 daily backups and point-in-time recovery", () => {
    expect(tf).toMatch(/retained_backups\s*=\s*30/);
    expect(tf).toMatch(/binary_log_enabled\s*=\s*true/);
    expect(tf).toMatch(/transaction_log_retention_days\s*=\s*7/);
  });

  it("lets only the connector in: no authorized networks, client certificates required", () => {
    expect(tf).not.toContain("authorized_networks");
    expect(tf).toMatch(/ssl_mode\s*=\s*"TRUSTED_CLIENT_CERTIFICATE_REQUIRED"/);
  });

  it("generates the password with no symbol a shell or SQL string would read (I4)", () => {
    expect(tf).toMatch(/resource "random_password" "database" \{[^}]*special\s*=\s*false/);
  });
});
