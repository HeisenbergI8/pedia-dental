import { z } from "zod";

/** Fixed physical names: the deploy workflow and the runbooks use them (decisions.md I1). Change them together. */
export const NAMES = {
  foundationStack: "PrimolarFoundation",
  serviceStack: "PrimolarService",
  repository: "primolar-api",
  cluster: "primolar",
  workerFamily: "primolar-api",
  webFamily: "primolar-api-web",
  releaseFamily: "primolar-api-release",
  taskRole: "primolar-api-task",
  executionRole: "primolar-api-execution",
  deployRole: "primolar-github-deploy",
  logGroup: "/primolar/api",
  githubEnvironment: "production",
  databaseName: "primolar",
  databaseUser: "primolar",
  databaseSecret: "primolar/database",
  budget: "primolar-monthly",
} as const;

export const REGION = "ap-southeast-1";
/** Pinned, so synthesis never looks up the account's zones: it runs offline, in `pnpm run check` (decisions.md I2). */
export const AVAILABILITY_ZONES = ["ap-southeast-1a", "ap-southeast-1b"];
/** The API's port (apps/api/Dockerfile `EXPOSE 4100`, env.ts PORT default). */
export const API_PORT = 4100;

/** Set in code rather than cdk.json, so a test's `new App({ context: FEATURE_FLAGS })` matches `cdk deploy`. */
export const FEATURE_FLAGS = {
  "@aws-cdk/aws-ec2:restrictDefaultSecurityGroup": true,
  "@aws-cdk/aws-iam:minimizePolicies": true,
  "@aws-cdk/core:checkSecretUsage": true,
} as const;

const notSet = (key: string) => `${key} is not set: fill it in packages/infra/cdk.json (first-time setup runbook) or pass -c ${key}=…`;
/** A required text setting. An unfilled cdk.json value ("") counts as not set. */
const required = (key: string) => z.string({ error: notSet(key) }).trim().min(1, notSet(key));
/** An optional setting: "" (the committed placeholder) and null read as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
/** cdk.json gives booleans; `-c key=value` gives strings. The same words env.ts accepts. */
const flag = () => z.union([z.boolean(), z.stringbool({ truthy: ["true", "1"], falsy: ["false", "0"] })]);
/** env.ts refuses anything else in CORS_ORIGIN outside APP_ENV=local. */
const httpsOrigin = z.string().refine(
  (value) => URL.canParse(value) && new URL(value).origin === value && value.startsWith("https://"),
  "must be an https origin (https://host, no path or trailing slash)",
);

const SettingsShape = z.object({
  apiDomain: required("apiDomain").toLowerCase().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "apiDomain must be a host name, like api.example.com"),
  webOrigins: required("webOrigins")
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(httpsOrigin).min(1)),
  webUrl: required("webUrl").refine((value) => URL.canParse(value) && value.startsWith("https://"), "webUrl must be the web app's https:// address"),
  alertEmail: required("alertEmail").pipe(z.email("alertEmail must be an email address")),
  githubRepo: required("githubRepo").regex(/^[\w.-]+\/[\w.-]+$/, "githubRepo must be owner/name"),
  appEnv: z.enum(["demo", "production"]).default("production"),
  demoLogins: flag().default(false),
  trustProxyHops: z.coerce.number().int().min(0).max(3).default(2),
  extraWebTasks: z.coerce.number().int().min(0).max(10).default(0),
  monthlyBudgetUsd: z.coerce.number().positive().default(100),
  certificateArn: optional(z.string().startsWith("arn:aws:acm:")),
  githubOidcProviderArn: optional(z.string().startsWith("arn:aws:iam::")),
  semaphoreSecretArn: optional(z.string().startsWith("arn:aws:secretsmanager:")),
  smsSenderName: optional(z.string().min(1).max(11)),
  databaseHostOverride: optional(z.string().min(1)),
});

export const Settings = SettingsShape.superRefine((settings, ctx) => {
  if (settings.appEnv === "production" && settings.demoLogins) {
    ctx.addIssue({ code: "custom", path: ["demoLogins"], message: "demoLogins can't be true with appEnv=production (the API refuses it too)" });
  }
  // Texted invite and reset links open WEB_URL; the browser on that page calls the API, so its origin must pass CORS.
  if (URL.canParse(settings.webUrl) && !settings.webOrigins.includes(new URL(settings.webUrl).origin)) {
    ctx.addIssue({ code: "custom", path: ["webUrl"], message: "webUrl's origin must be one of webOrigins" });
  }
});

export type Settings = z.infer<typeof Settings>;
/** Every setting's name: cdk.json's "context" lists exactly these (test/app.test.ts). */
export const SETTING_KEYS = Object.keys(SettingsShape.shape);

/** Reads every setting through `read` (the CDK context in bin/app.ts) and stops synthesis on the first bad one. */
export function settingsFrom(read: (key: string) => unknown): Settings {
  const raw = Object.fromEntries(SETTING_KEYS.map((key) => [key, read(key)]));
  const parsed = Settings.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid infra settings (packages/infra/cdk.json "context", or -c key=value):\n${lines.join("\n")}`);
  }
  return parsed.data;
}
