import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { NAMES, REGION } from "./support/terraform";

type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown> };
const raw = readFileSync(new URL("../../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const workflow = parse(raw);
const job = workflow.jobs.deploy;
const steps: Step[] = job.steps;
const stepIndex = (name: string) => steps.findIndex((step) => step.name === name);

describe("deploy.yml", () => {
  it("runs only by hand, on master, in the production environment, one at a time (I15)", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(job.if).toContain("refs/heads/master");
    expect(job.environment).toBe(NAMES.githubEnv);
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("signs in through Workload Identity Federation and stores no Google or AWS key (I16)", () => {
    expect(workflow.permissions["id-token"]).toBe("write");
    const auth = steps.find((step) => step.uses?.startsWith("google-github-actions/auth@"));
    expect(auth?.with).toEqual({
      workload_identity_provider: "${{ vars.GCP_WORKLOAD_IDENTITY_PROVIDER }}",
      service_account: "${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}",
    });
    expect(raw).not.toMatch(/credentials_json|GOOGLE_APPLICATION_CREDENTIALS|secrets\.GCP|aws-actions|secrets\.AWS/);
  });

  it("pins every action to a commit SHA", () => {
    for (const step of steps.filter((s) => s.uses)) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it("refuses a commit without a green check before it builds anything", () => {
    const guard = stepIndex("Refuse a commit without a green check (api.yml)");
    expect(guard).toBeGreaterThan(-1);
    expect(steps[guard]?.run).toContain("--workflow api.yml");
    expect(guard).toBeLessThan(stepIndex("Build and push the image"));
  });

  it("builds from the repository root into the Terraform registry, tagged by commit", () => {
    const build = steps[stepIndex("Build and push the image")]!;
    expect(build.with).toMatchObject({ context: ".", file: "apps/api/Dockerfile", push: true });
    expect(String(build.with!.tags)).toBe("${{ env.IMAGE }}:${{ steps.tag.outputs.tag }}");
    expect(job.env.IMAGE).toBe(`${REGION}-docker.pkg.dev/\${{ vars.GCP_PROJECT_ID }}/${NAMES.registry}/${NAMES.image}`);
    expect(job.env).toMatchObject({ REGION, SERVICE: NAMES.service, RELEASE_JOB: NAMES.releaseJob });
  });

  it("migrates with the new image before the service moves, and stops if migrating fails (B13a E4)", () => {
    const exists = stepIndex("The service and the release job exist");
    const release = stepIndex("Run the release job (prisma migrate deploy)");
    const update = stepIndex("Update the service to the new image");
    expect([exists, release, update].every((i) => i > -1)).toBe(true);
    expect(exists).toBeLessThan(release);
    expect(release).toBeLessThan(update);
    expect(steps[release]!.run).toMatch(/jobs update[\s\S]*jobs execute[\s\S]*--wait[\s\S]*exit 1/);
    expect(steps[release]!.if).toBe("steps.tag.outputs.build == 'true'");
    expect(steps[update]!.if).toBeUndefined(); // a rollback runs it too
  });

  it("never runs Terraform: the owner applies it by hand (I1)", () => {
    expect(raw).not.toMatch(/terraform (apply|plan|init)/);
  });

  it("re-runs a commit by reusing its pushed image, and checks a rollback's tag exists", () => {
    const check = stepIndex("Image already pushed for this commit?");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(stepIndex("Build and push the image"));
    expect(steps[stepIndex("Build and push the image")]!.if).toContain("steps.pushed.outputs.exists != 'true'");
    expect(steps[stepIndex("Rollback target exists in Artifact Registry")]!.if).toBe("steps.tag.outputs.build == 'false'");
  });
});
