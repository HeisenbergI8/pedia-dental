import { readFileSync } from "node:fs";
import { Template } from "aws-cdk-lib/assertions";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { NAMES } from "../src/config";
import { exampleStacks } from "./support/stacks";

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
    expect(job.environment).toBe(NAMES.githubEnvironment);
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("signs in with OIDC as the foundation's deploy role and stores no AWS keys (I16)", () => {
    expect(workflow.permissions["id-token"]).toBe("write");
    const credentials = steps.find((step) => step.uses?.startsWith("aws-actions/configure-aws-credentials@"));
    expect(credentials?.with?.["role-to-assume"]).toBe("${{ vars.AWS_DEPLOY_ROLE_ARN }}");
    expect(raw).not.toMatch(/aws-access-key-id|aws-secret-access-key|AWS_SECRET_ACCESS_KEY|secrets\.AWS/);
  });

  it("refuses a commit without a green check before it builds anything", () => {
    const guard = stepIndex("Refuse a commit without a green check (api.yml)");
    expect(steps[guard]?.run).toContain("--workflow api.yml");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(stepIndex("Build and push the image"));
  });

  it("builds the API's image from the repository root, tagged by commit", () => {
    const build = steps[stepIndex("Build and push the image")]!;
    expect(build.with).toMatchObject({ context: ".", file: "apps/api/Dockerfile", push: true });
    expect(String(build.with!.tags)).toContain(`/${NAMES.repository}:\${{ steps.tag.outputs.tag }}`);
  });

  it("migrates with the new image before the services move, and stops if migrating fails (B13a E4)", () => {
    const point = stepIndex("Point the release task at the new image");
    const run = stepIndex("Run the release task (prisma migrate deploy)");
    const update = stepIndex("Update the services to the new image");
    expect([point, run, update].every((i) => i > -1)).toBe(true);
    expect(point).toBeLessThan(run);
    expect(run).toBeLessThan(update);
    expect(steps[point]!.run).toContain("ImageTag=${{ steps.current.outputs.tag }}");
    expect(steps[run]!.run).toMatch(/exitCode[\s\S]*exit 1/);
    expect(steps[update]!.if).toBeUndefined(); // a rollback runs it too
  });

  it("deploys only the service stack, never the foundation (I1)", () => {
    const deploys = steps.filter((step) => step.run?.includes("cdk deploy"));
    expect(deploys).toHaveLength(2);
    for (const step of deploys) expect(step.run).toMatch(/--exclusively/);
    expect(raw).not.toContain(NAMES.foundationStack);
    expect(job.env).toMatchObject({ SERVICE_STACK: NAMES.serviceStack, REPOSITORY: NAMES.repository, AWS_REGION: "ap-southeast-1" });
  });

  it("reads only outputs the service stack defines", () => {
    const outputs = Object.keys(Template.fromStack(exampleStacks().service).findOutputs("*"));
    for (const used of ["ClusterName", "ReleaseTaskDefinitionArn", "TaskSubnetIds", "TaskSecurityGroupId", "ImageTagInUse"]) {
      expect(raw).toContain(used);
      expect(outputs).toContain(used);
    }
  });

  it("re-runs a commit by reusing its pushed image, and stops on a stack left without outputs", () => {
    const check = stepIndex("Image already pushed for this commit?");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(stepIndex("Build and push the image"));
    expect(steps[stepIndex("Build and push the image")]!.if).toContain("steps.pushed.outputs.exists != 'true'");
    expect(steps[stepIndex("Run the release task (prisma migrate deploy)")]!.if).toBe("steps.tag.outputs.build == 'true'");
    expect(steps[stepIndex("Read the tag the services run now")]!.run).toMatch(/grep -Eq '\^\[0-9a-f\]\{7,40\}\$'/);
  });
});
