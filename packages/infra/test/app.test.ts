import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAMES, SETTING_KEYS } from "../src/config";
import { exampleStacks } from "./support/stacks";

describe("the CDK app", () => {
  it("synthesizes both stacks offline with no cross-stack cycle: what `cdk synth` runs", () => {
    const assembly = exampleStacks().app.synth();
    expect(assembly.stacks.map((stack) => stack.stackName).sort()).toEqual([NAMES.foundationStack, NAMES.serviceStack]);
    expect(assembly.getStackByName(NAMES.serviceStack).dependencies.map((d) => d.id)).toContain(NAMES.foundationStack);
    expect(assembly.getStackByName(NAMES.foundationStack).dependencies.map((d) => d.id)).not.toContain(NAMES.serviceStack);
  });

  it("protects the foundation from deletion and needs no account to synthesize", () => {
    const { foundation, service } = exampleStacks();
    expect(foundation.terminationProtection).toBe(true);
    expect(foundation.region).toBe("ap-southeast-1");
    expect(service.resolve(service.account)).toEqual({ Ref: "AWS::AccountId" });
  });

  it("lists exactly the settings in cdk.json, so none is silently left at a default", () => {
    const cdkJson = JSON.parse(readFileSync(new URL("../cdk.json", import.meta.url), "utf8")) as { app: string; context: Record<string, unknown> };
    expect(Object.keys(cdkJson.context).sort()).toEqual([...SETTING_KEYS].sort());
    expect(cdkJson.app).toBe("pnpm exec tsx bin/app.ts");
  });
});
