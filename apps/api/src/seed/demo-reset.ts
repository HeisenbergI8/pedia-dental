import { seedPlatform } from "@pedia/seed";
import type { Hasher } from "../auth/hashing";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { FileStorage } from "../storage/storage";
import { SeedRefused, seedDatabase } from "./seed-database";

/** Kept by a reset: Prisma's migration log, and the job lease the nightly reset itself holds while it runs. */
const KEPT = new Set(["_prisma_migrations", "JobLock"]);

/** B13c1 E5: never on production; only where the demo logins are on (the seed's own rule, assertSeedAllowed). */
export function assertResetAllowed(env: Pick<Env, "APP_ENV" | "DEMO_LOGINS">): void {
  if (env.APP_ENV === "production") throw new SeedRefused("Refusing to reset: APP_ENV=production holds clinics' real data.");
  if (!env.DEMO_LOGINS) throw new SeedRefused("Refusing to reset: set DEMO_LOGINS=true (demo deployments only).");
}

/**
 * Empties every table and seeds the demo clinics again, as of today (`db:demo-reset`, and DemoResetJobs at night).
 * Sessions go too, so everyone signs in again. Seeded files are rewritten under the same keys; files visitors uploaded
 * stay in storage, unreferenced (E5). Raw SQL on purpose: a truncation is not a model query (as the int tests' reset).
 */
export async function resetDemo(prisma: PrismaService, hasher: Hasher, env: Pick<Env, "APP_ENV" | "DEMO_LOGINS">, files?: FileStorage): Promise<void> {
  assertResetAllowed(env);
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
  for (const { name } of tables) if (!KEPT.has(name)) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
  await seedDatabase(prisma, hasher, env, seedPlatform(), files);
}
