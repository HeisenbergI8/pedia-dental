import type { App } from "aws-cdk-lib";
import { NAMES, REGION, type Settings } from "./config";
import { FoundationStack } from "./foundation-stack";
import { ServiceStack } from "./service-stack";

/** Both stacks. Only the region is pinned; the account is whichever credentials run `cdk deploy` (no lookups, I17). */
export function definePrimolar(app: App, settings: Settings) {
  const env = { region: REGION };
  const foundation = new FoundationStack(app, NAMES.foundationStack, {
    env, settings, terminationProtection: true,
    description: "Primolar: network, database, files, images, certificate, alerts, budget, deploy role (B13b)",
  });
  const service = new ServiceStack(app, NAMES.serviceStack, {
    env, settings, foundation,
    description: "Primolar: the API on ECS Fargate behind an HTTPS load balancer (B13b)",
  });
  return { foundation, service };
}
