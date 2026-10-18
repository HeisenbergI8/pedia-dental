import { readFileSync } from "node:fs";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { DRAIN } from "../src/service-stack";
import { exampleStacks, statementsOf } from "./support/stacks";

type Container = { Command: string[]; Environment?: { Name: string; Value: unknown }[]; Secrets?: { Name: string }[]; PortMappings?: unknown[]; HealthCheck?: { Command: string[] }; StopTimeout?: number; Image: unknown };

const serviceOf = (overrides: Record<string, unknown> = {}) => Template.fromStack(exampleStacks(overrides).service);
const taskDefinitions = (template: Template) =>
  Object.values(template.findResources("AWS::ECS::TaskDefinition")).map((r) => r.Properties as { Family: string; ContainerDefinitions: Container[] });
const containerOf = (template: Template, family: string) => taskDefinitions(template).find((t) => t.Family === family)!.ContainerDefinitions[0]!;
const envOf = (container: Container) => Object.fromEntries((container.Environment ?? []).map((e) => [e.Name, e.Value]));

// B13a: the API drains for SHUTDOWN_GRACE_MS after SIGTERM. Read from the API's source, so neither side changes alone.
const readiness = readFileSync(new URL("../../../apps/api/src/health/readiness.ts", import.meta.url), "utf8");
const graceMs = Number(/SHUTDOWN_GRACE_MS = ([\d_]+)/.exec(readiness)![1]!.replaceAll("_", ""));

describe("PrimolarService", () => {
  let template: Template;
  beforeAll(() => {
    template = serviceOf();
  });

  it("runs background work on exactly one task, in a service pinned to one (I8)", () => {
    const background = taskDefinitions(template).filter((t) => t.ContainerDefinitions.some((c) => envOf(c).BACKGROUND_WORK === "true"));
    expect(background.map((t) => t.Family)).toEqual(["primolar-api"]);
    expect(envOf(containerOf(template, "primolar-api-web")).BACKGROUND_WORK).toBe("false");
    template.hasResourceProperties("AWS::ECS::Service", { ServiceName: "api", DesiredCount: 1 });
    template.hasResourceProperties("AWS::ECS::Service", { ServiceName: "api-web", DesiredCount: 0 });
    serviceOf({ extraWebTasks: 2 }).hasResourceProperties("AWS::ECS::Service", { ServiceName: "api-web", DesiredCount: 2 });
  });

  it("checks the container on /api/health/live and the target on /api/health/ready (B13a E5, I9)", () => {
    expect(containerOf(template, "primolar-api").HealthCheck!.Command.join(" ")).toContain("/api/health/live");
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      Port: 4100, HealthCheckPath: "/api/health/ready", HealthCheckIntervalSeconds: 5, HealthCheckTimeoutSeconds: 3,
      HealthyThresholdCount: 2, UnhealthyThresholdCount: 2, Matcher: { HttpCode: "200" },
      TargetGroupAttributes: Match.arrayWith([{ Key: "deregistration_delay.timeout_seconds", Value: "30" }]),
    });
  });

  it("fits the API's drain: two failed ready checks inside the grace, the grace well inside the stop timeout", () => {
    expect(graceMs).toBeGreaterThan(0);
    expect(2 * DRAIN.healthCheckInterval.toMilliseconds()).toBeLessThan(graceMs);
    for (const family of ["primolar-api", "primolar-api-web"]) {
      expect(containerOf(template, family).StopTimeout! * 1000).toBeGreaterThanOrEqual(graceMs + 10_000);
    }
    expect(DRAIN.deregistrationDelay.toMilliseconds()).toBeGreaterThanOrEqual(graceMs);
  });

  it("builds DATABASE_URL in the container; the password only ever comes from Secrets Manager (I4)", () => {
    const api = containerOf(template, "primolar-api");
    expect(api.Command).toEqual(["sh", "-c", 'export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?allowPublicKeyRetrieval=true" && exec node --enable-source-maps dist/main.mjs']);
    expect(api.Secrets!.map((s) => s.Name).sort()).toEqual(["DB_PASSWORD", "DB_USER"]);
    expect(Object.keys(envOf(api))).not.toEqual(expect.arrayContaining(["DATABASE_URL"]));
    expect(JSON.stringify(api.Environment)).not.toMatch(/PASSWORD|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|SEMAPHORE_API_KEY/);
  });

  it("runs migrations as a one-off task from its own image tag, serving nothing (B13a E4, I7)", () => {
    const release = containerOf(template, "primolar-api-release");
    expect(release.Command[2]).toMatch(/ && exec node_modules\/\.bin\/prisma migrate deploy$/);
    expect(release.PortMappings ?? []).toEqual([]);
    expect(envOf(release)).not.toHaveProperty("BACKGROUND_WORK");
    expect(JSON.stringify(release.Image)).toContain('"Ref":"ReleaseImageTag"');
    expect(JSON.stringify(containerOf(template, "primolar-api").Image)).toContain('"Ref":"ImageTag"');
    template.hasParameter("ImageTag", { Type: "String", AllowedPattern: "^[0-9a-f]{7,40}$" });
  });

  it("sets B13a's environment table", () => {
    const env = envOf(containerOf(template, "primolar-api"));
    expect(env).toMatchObject({
      APP_ENV: "production", CORS_ORIGIN: "https://app.example.com", WEB_URL: "https://app.example.com",
      S3_REGION: "ap-southeast-1", TRUST_PROXY_HOPS: "2", METRICS_INTERVAL_S: "60", DEMO_LOGINS: "false", DB_NAME: "primolar",
    });
    expect(env.S3_BUCKET).toBeDefined();
    expect(env).not.toHaveProperty("SMS_SENDER_NAME");
    expect(env).not.toHaveProperty("COOKIE_SECURE"); // the API's default, true
  });

  it("resets the demo nightly from the background task only, and only when asked (B13c1 E5)", () => {
    expect(envOf(containerOf(template, "primolar-api"))).not.toHaveProperty("DEMO_DAILY_RESET");
    const demo = serviceOf({ appEnv: "demo", demoLogins: true, demoDailyReset: true, extraWebTasks: 1 });
    expect(envOf(containerOf(demo, "primolar-api")).DEMO_DAILY_RESET).toBe("true");
    expect(envOf(containerOf(demo, "primolar-api-web"))).not.toHaveProperty("DEMO_DAILY_RESET");
  });

  it("adds the Semaphore key and sender name only once they are set (I12)", () => {
    const api = containerOf(serviceOf({
      semaphoreSecretArn: "arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:primolar/semaphore-AbCdEf",
      smsSenderName: "PRIMOLAR",
    }), "primolar-api");
    expect(api.Secrets!.map((s) => s.Name)).toContain("SEMAPHORE_API_KEY");
    expect(envOf(api).SMS_SENDER_NAME).toBe("PRIMOLAR");
  });

  it("points every task at a restored database by setting (I22)", () => {
    const restored = serviceOf({ databaseHostOverride: "drill.abc.ap-southeast-1.rds.amazonaws.com" });
    for (const family of ["primolar-api", "primolar-api-release"]) {
      expect(envOf(containerOf(restored, family)).DB_HOST).toBe("drill.abc.ap-southeast-1.rds.amazonaws.com");
    }
  });

  it("lets the API reach clinics/* and platform/* in its bucket, and nothing else (I6, B12)", () => {
    const text = JSON.stringify(statementsOf(template, "TaskRole"));
    expect(text).toContain("/clinics/*");
    expect(text).toContain("/platform/*");
    expect(text).toContain("s3:ListBucket");
    expect(text).not.toMatch(/"s3:\*"|s3:PutBucket|s3:DeleteBucket|"\*"/);
  });

  it("runs tasks in public subnets with a public IP, admitting only the load balancer (I2)", () => {
    template.hasResourceProperties("AWS::ECS::Service", {
      ServiceName: "api",
      NetworkConfiguration: { AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "ENABLED" }) },
      DeploymentConfiguration: Match.objectLike({ MinimumHealthyPercent: 100, MaximumPercent: 200, DeploymentCircuitBreaker: { Enable: true, Rollback: true } }),
    });
    template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
      FromPort: 4100, ToPort: 4100, SourceSecurityGroupId: { "Fn::GetAtt": [Match.stringLikeRegexp("^AlbSg"), "GroupId"] },
    });
  });

  it("serves HTTPS with the recommended TLS policy and redirects port 80 (I10)", () => {
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", { Port: 443, Protocol: "HTTPS", SslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06" });
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 80, DefaultActions: [Match.objectLike({ Type: "redirect", RedirectConfig: Match.objectLike({ Port: "443", Protocol: "HTTPS", StatusCode: "HTTP_301" }) })],
    });
  });

  it("alarms on unhandled errors, a stuck outbox and no healthy task, to the alert topic (I13)", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "Primolar/API", MetricName: "UnhandledErrors", Dimensions: [{ Name: "Service", Value: "api" }], Statistic: "Sum",
      Threshold: 0, ComparisonOperator: "GreaterThanThreshold", TreatMissingData: "notBreaching", AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      Namespace: "Primolar/API", MetricName: "OutboxOldestSeconds", Statistic: "Maximum", Period: 300, Threshold: 600, TreatMissingData: "breaching",
    });
    template.hasResourceProperties("AWS::CloudWatch::Alarm", { MetricName: "HealthyHostCount", Threshold: 1, ComparisonOperator: "LessThanThreshold", EvaluationPeriods: 3 });
    template.hasResourceProperties("AWS::Logs::LogGroup", { LogGroupName: "/primolar/api", RetentionInDays: 90 });
  });

  it("gives each task an environment the API's own loadEnv accepts at start-up (APP_ENV=production)", async () => {
    const { loadEnv } = await import("../../../apps/api/src/config/env");
    for (const family of ["primolar-api", "primolar-api-web"]) {
      const container = containerOf(template, family);
      const env = Object.fromEntries(Object.entries(envOf(container)).map(([name, value]) => [name, typeof value === "string" ? value : "resolved-at-deploy"]));
      const url = /DATABASE_URL="([^"]+)"/.exec(container.Command[2]!)![1]!.replace("$DB_USER", "primolar").replace("$DB_PASSWORD", "x").replace("$DB_HOST", "db.internal").replace("$DB_PORT", "3306").replace("$DB_NAME", "primolar");
      const parsed = loadEnv({ ...env, DATABASE_URL: url });
      expect([parsed.APP_ENV, parsed.COOKIE_SECURE, parsed.BACKGROUND_WORK]).toEqual(["production", true, family === "primolar-api"]);
    }
  });
});
