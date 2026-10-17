import { z } from "zod";

/** "true"/"1" or "false"/"0" only: Zod's default also takes yes/on/enabled, and a typo should stop startup. */
const flag = () => z.stringbool({ truthy: ["true", "1"], falsy: ["false", "0"] });

const Env = z.object({
  DATABASE_URL: z.string().startsWith("mysql://", "DATABASE_URL must be a mysql:// URL"),
  PORT: z.coerce.number().int().positive().default(4100),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // A demo deployment: `prisma db seed` may run, and the sign-in page's one-click logins (DemoLogin) are served (B2c).
  DEMO_LOGINS: flag().default(false),
  // `Secure` on pd_session / pd_operator / pd_branch. Off only for local http (`.env`), never in a deployment.
  COOKIE_SECURE: flag().default(true),
  // This process runs the scheduled jobs and the outbox worker (main.ts → AppModule.forRoot's `background`).
  // false for an instance that only serves requests. Tests never start background work, whatever this says.
  BACKGROUND_WORK: flag().default(true),
  // How long the outbox worker waits after finding nothing to send.
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(2000),
  // The local-disk storage driver's root, relative to the API's working directory (B10 adds S3/R2).
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
  // One shared sender name for every clinic (decision 3), approved on the Semaphore account first. Not chosen yet
  // (decision 18): unset sends without one, so Semaphore uses its own default name.
  SMS_SENDER_NAME: z.string().min(1).max(11).optional(),
  SEMAPHORE_URL: z.url().default("https://api.semaphore.co/api/v4/messages"),
});

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
