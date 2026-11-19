import { readFileSync } from "node:fs";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { exampleStacks } from "./support/stacks";

type Statement = { Sid: string; Effect: string; Action: string | string[]; Resource: string | string[]; Condition?: unknown };
const raw = readFileSync(new URL("../policies/cfn-execution.json", import.meta.url), "utf8");
const policy = JSON.parse(raw) as { Version: string; Statement: Statement[] };
const list = (value: string | string[]) => (Array.isArray(value) ? value : [value]);
const actions = policy.Statement.flatMap((s) => list(s.Action));

/** CloudFormation's resource namespace → the IAM service prefix that creates it. */
const IAM_PREFIX: Record<string, string> = {
  EC2: "ec2", S3: "s3", ECR: "ecr", RDS: "rds", SecretsManager: "secretsmanager", Lambda: "lambda", IAM: "iam",
  CertificateManager: "acm", SNS: "sns", Budgets: "budgets", ECS: "ecs", Logs: "logs", ElasticLoadBalancingV2: "elasticloadbalancing",
  WAFv2: "wafv2", CloudWatch: "cloudwatch",
};

describe("the CloudFormation execution policy (#14: cdk bootstrap --cloudformation-execution-policies)", () => {
  it("is a valid managed policy within IAM's 6,144-character limit", () => {
    expect(policy.Version).toBe("2012-10-17");
    expect(raw.replace(/\s/g, "").length).toBeLessThan(6144);
    // Every grant is an Allow; the one Deny keeps database snapshots from being shared out of the account.
    for (const statement of policy.Statement) expect(statement.Effect === "Allow" || statement.Sid === "NeverShareDatabaseSnapshots").toBe(true);
  });

  it("grants no administrator wildcard", () => {
    expect(actions).not.toContain("*");
    expect(actions.filter((action) => /^(iam|sts|organizations|kms):\*/.test(action) || action.startsWith("sts:"))).toEqual([]);
  });

  it("limits IAM to Primolar's own roles, the GitHub OIDC provider and service-linked roles", () => {
    const iam = policy.Statement.filter((s) => list(s.Action).some((action) => action.startsWith("iam:")));
    const resources = iam.flatMap((s) => list(s.Resource));
    for (const resource of resources) {
      expect(resource).toMatch(/^arn:aws:iam::\*:(role\/primolar-\*|role\/Primolar\*|oidc-provider\/token\.actions\.githubusercontent\.com|role\/aws-service-role\/\*)$/);
    }
    const iamActions = iam.flatMap((s) => list(s.Action));
    for (const forbidden of ["iam:CreateUser", "iam:CreateAccessKey", "iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:PutUserPolicy"]) expect(iamActions).not.toContain(forbidden);
    // A managed policy may be attached only if it is the Lambda basic execution role's (CDK's custom resources).
    const attach = iam.find((s) => list(s.Action).includes("iam:AttachRolePolicy"))!;
    expect(JSON.stringify(attach.Condition)).toContain("service-role/AWSLambdaBasicExecutionRole");
  });

  it("covers every kind of resource both stacks create", () => {
    const { foundation, service } = exampleStacks();
    const types = new Set([foundation, service].flatMap((stack) => Object.values(Template.fromStack(stack).toJSON().Resources as Record<string, { Type: string }>).map((r) => r.Type)));
    for (const type of types) {
      if (type.startsWith("Custom::")) continue; // a Lambda function the policy covers
      const namespace = type.split("::")[1]!;
      const prefix = IAM_PREFIX[namespace];
      expect(prefix, `${type} has no IAM prefix mapped`).toBeDefined();
      expect(actions.some((action) => action.startsWith(`${prefix}:`)), `${type} needs ${prefix}:*`).toBe(true);
    }
  });
});
