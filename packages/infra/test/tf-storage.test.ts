import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("storage.tf");

describe("storage.tf (I6 on Cloud Storage)", () => {
  it("is private: uniform access, public access prevented", () => {
    expect(tf).toMatch(/uniform_bucket_level_access\s*=\s*true/);
    expect(tf).toMatch(/public_access_prevention\s*=\s*"enforced"/);
    expect(tf).not.toMatch(/allUsers|allAuthenticatedUsers/);
  });

  it("keeps old versions 35 days and never deletes current files", () => {
    expect(tf).toMatch(/versioning\s*\{\s*enabled\s*=\s*true/);
    expect(tf).toMatch(/days_since_noncurrent_time\s*=\s*35/);
    expect(tf).not.toMatch(/condition\s*\{\s*age\s*=\s*\d+\s*\}\s*action\s*\{\s*type\s*=\s*"Delete"/);
  });

  it("can't be destroyed with its files", () => {
    expect(tf).toMatch(/force_destroy\s*=\s*false/);
    expect(tf).toMatch(/prevent_destroy\s*=\s*true/);
  });

  it("gives the HMAC key's account the bucket's objects only, never a project role", () => {
    expect(tf).toMatch(/role\s*=\s*"roles\/storage\.objectUser"/);
    expect(tf).not.toContain("google_project_iam_member");
  });
});
