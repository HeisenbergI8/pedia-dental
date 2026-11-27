import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const workflow = parse(readFileSync(new URL("../../../.github/workflows/api.yml", import.meta.url), "utf8"));

describe("api.yml's terraform job", () => {
  const job = workflow.jobs.terraform;
  const runs: string[] = (job?.steps ?? []).map((step: { run?: string }) => step.run).filter(Boolean);

  it("checks the Terraform files on every push and pull request", () => {
    expect(job?.defaults?.run?.["working-directory"]).toBe("packages/infra/terraform");
    expect(runs).toEqual(["terraform fmt -check -recursive", "terraform init -backend=false -input=false", "terraform validate"]);
  });

  it("never touches Google Cloud: no backend, no credentials, no apply", () => {
    expect(JSON.stringify(job)).not.toMatch(/google-github-actions|apply|secrets\./);
    expect(workflow.permissions).toEqual({ contents: "read" });
  });
});
