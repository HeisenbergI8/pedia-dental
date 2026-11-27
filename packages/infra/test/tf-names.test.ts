import { describe, expect, it } from "vitest";
import { NAMES, readTf } from "./support/terraform";

describe("apis.tf names", () => {
  const tf = readTf("apis.tf");

  it("matches the names the tests, the workflow and the runbooks use", () => {
    expect(tf).toMatch(new RegExp(`registry\\s*=\\s*"${NAMES.registry}"`));
    expect(tf).toMatch(new RegExp(`image\\s*=\\s*"${NAMES.image}"`));
    expect(tf).toMatch(new RegExp(`service\\s*=\\s*"${NAMES.service}"`));
    expect(tf).toMatch(new RegExp(`release_job\\s*=\\s*"${NAMES.releaseJob}"`));
    expect(tf).toMatch(new RegExp(`deploy_account\\s*=\\s*"${NAMES.deployAccount}"`));
    expect(tf).toMatch(new RegExp(`sql_instance\\s*=\\s*"${NAMES.sqlInstance}"`));
    expect(tf).toMatch(new RegExp(`github_env\\s*=\\s*"${NAMES.githubEnv}"`));
  });

  it("never turns an API off when the list changes", () => {
    expect(tf).toMatch(/disable_on_destroy\s*=\s*false/);
  });
});
