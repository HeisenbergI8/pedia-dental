import { z } from "zod";
import { PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT, RECORD_RETENTION, retentionConfirmed } from "@pedia/shared";

/** "true"/"1" or "false"/"0" only: Zod's default also takes yes/on/enabled, and a typo should stop startup. */
const flag = () => z.stringbool({ truthy: ["true", "1"], falsy: ["false", "0"] });

const Env = z.object({
  DATABASE_URL: z.string().startsWith("mysql://", "DATABASE_URL must be a mysql:// URL"),
  PORT: z.coerce.number().int().positive().default(4100),
  // B13a: which kind of deployment this is. `demo` and `production` are hosted: they need https origins, secure cookies,
  // a real WEB_URL and shared storage. Only `production` refuses DEMO_LOGINS (real clinics' data).
  APP_ENV: z.enum(["local", "demo", "production"]).default("local"),
  // The web app's origins, allowed by CORS (comma-separated, each scheme://host[:port], no path, never "*").
  CORS_ORIGIN: z.string().default("http://localhost:3000").transform(originsOf),
  // B13a: how many proxies sit in front of the API (ALB = 1). Express then reads the client's address from
  // X-Forwarded-For, which the rate limits key on. 0 = trust nobody (local, tests).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  // B13a: seconds between the metrics lines (CloudWatch EMF). 0 = no metrics lines (local default, tests).
  METRICS_INTERVAL_S: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // A demo deployment: `prisma db seed` may run, and the sign-in page's one-click logins (DemoLogin) are served (B2c).
  DEMO_LOGINS: flag().default(false),
  // B13c1 E5: empty and reseed the demo clinics every night at 03:40 Manila (the seed is relative to its day), and seed an
  // empty database at start-up. Only with APP_ENV=demo and DEMO_LOGINS=true, and only on the instance running background
  // work. It wipes the database.
  DEMO_DAILY_RESET: flag().default(false),
  // `Secure` on pd_session / pd_operator / pd_branch. Off only for local http (`.env`), never in a deployment.
  COOKIE_SECURE: flag().default(true),
  // This process runs the scheduled jobs and the outbox worker (main.ts → AppModule.forRoot's `background`).
  // false for an instance that only serves requests. Tests never start background work, whatever this says.
  BACKGROUND_WORK: flag().default(true),
  // How long the outbox worker waits after finding nothing to send.
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(2000),
  // B13c2a (decisions.md C2): days to keep Primolar's operator audit trail. CONFIRM WITH COUNSEL before setting it.
  // Unset (the default): nothing is ever pruned. At least 365, so a typo can't empty the trail. Proposed: 1826 (5 years).
  OPERATOR_AUDIT_KEEP_DAYS: z.coerce.number().int().min(365, "OPERATOR_AUDIT_KEEP_DAYS must be at least 365 (one year)").optional(),
  // B13c2b (decisions.md E3, C4): working days to answer a data-subject request, Monday to Friday. CONFIRM WITH COUNSEL.
  // Stored on each request when it is logged, so a change moves only new deadlines.
  PRIVACY_REQUEST_DUE_WORKING_DAYS: z.coerce.number().int().min(1).max(60, "PRIVACY_REQUEST_DUE_WORKING_DAYS is at most 60").default(PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT),
  // B13c2b-2 (decisions.md D2): privacy.anonymise de-identifies restricted children whose retention has ended (03:30
  // Manila). Off by default; refused while RECORD_RETENTION's periods are unconfirmed (CONFIRM WITH COUNSEL).
  RETENTION_ERASURE: flag().default(false),
  // The local-disk storage driver's root, relative to the API's working directory (used when S3_BUCKET is unset, B10).
  STORAGE_DIR: z.string().min(1).default("var/storage"),
  // B10 (E11): the S3-compatible driver. Unset S3_BUCKET: the local-disk driver under STORAGE_DIR.
  S3_BUCKET: z.string().min(3).optional(),
  S3_REGION: z.string().min(1).default("ap-southeast-1"),
  // R2 or MinIO; unset for Amazon S3.
  S3_ENDPOINT: z.url().optional(),
  S3_FORCE_PATH_STYLE: flag().default(false),
  // Both or neither; neither = the SDK's default chain (an IAM role in production). Checked by fileStorageOf.
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Signs the local driver's links. Unset: a random secret per process (links die with it; each open makes a new one).
  STORAGE_LINK_SECRET: z.string().min(32, "STORAGE_LINK_SECRET must be at least 32 characters").optional(),
  // B9: real texts through Semaphore. Unset = the log driver, everywhere, production included (decision 11). Never logged.
  SEMAPHORE_API_KEY: z.string().min(1).optional(),
  // One shared sender name for every clinic (decision 3), approved on the Semaphore account first. It is
  // "PRIMOLAR" (decision 18); unset until Semaphore approves it, which sends with Semaphore's own default name.
  SMS_SENDER_NAME: z.string().min(1).max(11).optional(),
  SEMAPHORE_URL: z.url().default("https://api.semaphore.co/api/v4/messages"),
  // B11: the web app's address, which texted invite and reset links open. Set it in production (the default is dev's).
  WEB_URL: z.url().default("http://localhost:3000"),
}).superRefine((env, ctx) => {
  // B13c1 E5: a nightly wipe only where the data is the demo's by definition.
  if (env.DEMO_DAILY_RESET && (env.APP_ENV !== "demo" || !env.DEMO_LOGINS)) {
    ctx.addIssue({ code: "custom", path: ["DEMO_DAILY_RESET"], message: "DEMO_DAILY_RESET needs APP_ENV=demo and DEMO_LOGINS=true" });
  }
  // B13c2b-2 D2: anonymisation can't be switched on before counsel has given the periods, in any APP_ENV.
  if (env.RETENTION_ERASURE && !retentionConfirmed(RECORD_RETENTION)) {
    ctx.addIssue({ code: "custom", path: ["RETENTION_ERASURE"], message: "RETENTION_ERASURE can't be true while RECORD_RETENTION's periods are unconfirmed (packages/shared/src/domain/retention.ts; confirm with counsel)" });
  }
  if (env.APP_ENV === "local") return;
  const problem = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  // A hosted API must be told its web's address: the localhost defaults would let any local page call it.
  if (env.CORS_ORIGIN.some((origin) => !origin.startsWith("https://"))) problem("CORS_ORIGIN", "CORS_ORIGIN must list only https:// origins outside APP_ENV=local");
  if (!env.WEB_URL.startsWith("https://")) problem("WEB_URL", "WEB_URL must be the web app's https:// address outside APP_ENV=local");
  if (!env.COOKIE_SECURE) problem("COOKIE_SECURE", "COOKIE_SECURE can't be false outside APP_ENV=local");
  // The local-disk driver is per instance and its links die with the process (CONVENTIONS → Traps).
  if (!env.S3_BUCKET) problem("S3_BUCKET", "S3_BUCKET is required outside APP_ENV=local");
  if (env.APP_ENV === "production" && env.DEMO_LOGINS) problem("DEMO_LOGINS", "DEMO_LOGINS can't be true with APP_ENV=production");
});

/** "a, b" → ["a", "b"], each a bare origin. A path, a trailing slash or "*" is refused: CORS compares exact strings. */
function originsOf(value: string, ctx: z.RefinementCtx): string[] {
  const origins = value.split(",").map((part) => part.trim()).filter(Boolean);
  for (const origin of origins) {
    const parsed = URL.canParse(origin) ? new URL(origin) : undefined;
    if (!parsed || parsed.origin !== origin) ctx.addIssue({ code: "custom", message: `"${origin}" is not an origin (scheme://host[:port], no path or trailing slash)` });
  }
  if (!origins.length) ctx.addIssue({ code: "custom", message: "CORS_ORIGIN needs at least one origin" });
  return origins;
}

export type Env = z.infer<typeof Env>;

/** Parsed once at startup, so a missing or malformed variable stops the API before it listens. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}

export const ENV = Symbol("ENV");
