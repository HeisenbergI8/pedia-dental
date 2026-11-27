import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("deploy-identity.tf");

describe("deploy-identity.tf (I16)", () => {
  it("accepts only this repository's production environment on master", () => {
    expect(tf).toContain("assertion.repository == '${var.github_repo}'");
    expect(tf).toContain("assertion.environment == '${local.names.github_env}'");
    expect(tf).toContain("assertion.ref == 'refs/heads/master'");
    expect(tf).toMatch(/subject\/repo:\$\{var\.github_repo\}:environment:\$\{local\.names\.github_env\}/);
  });

  it("stores no key", () => {
    expect(tf).not.toContain("google_service_account_key");
  });

  it("grants run.developer on the service and the job only, never on the project", () => {
    expect(tf).toContain('resource "google_cloud_run_v2_service_iam_member" "deploy"');
    expect(tf).toContain('resource "google_cloud_run_v2_job_iam_member" "deploy"');
    const projectRoles = [...tf.matchAll(/resource "google_project_iam_member"[\s\S]*?role\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(projectRoles).toEqual(["roles/run.viewer"]);
  });
});
