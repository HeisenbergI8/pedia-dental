import { App } from "aws-cdk-lib";
import type { Template } from "aws-cdk-lib/assertions";
import { FEATURE_FLAGS } from "../../src/config";
import { definePrimolar } from "../../src/primolar";
import { exampleSettings } from "./settings";

/** Both stacks, wired exactly as bin/app.ts wires them, from example settings. Offline: no account, no lookups. */
export function exampleStacks(overrides: Record<string, unknown> = {}) {
  const app = new App({ context: FEATURE_FLAGS });
  return { app, ...definePrimolar(app, exampleSettings(overrides)) };
}

/** Every IAM statement attached to the role whose logical id starts with `rolePrefix`. */
export const statementsOf = (template: Template, rolePrefix: string) =>
  Object.values(template.findResources("AWS::IAM::Policy"))
    .filter((policy) => JSON.stringify(policy.Properties.Roles).includes(rolePrefix))
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement as Record<string, unknown>[]);
