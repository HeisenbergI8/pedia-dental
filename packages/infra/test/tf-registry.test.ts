import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("registry.tf");

describe("registry.tf (I7)", () => {
  it("never overwrites a tag", () => {
    expect(tf).toMatch(/immutable_tags\s*=\s*true/);
  });

  it("keeps the 30 newest images as rollback targets, and really cleans up", () => {
    expect(tf).toMatch(/keep_count\s*=\s*30/);
    expect(tf).toMatch(/cleanup_policy_dry_run\s*=\s*false/);
  });
});
