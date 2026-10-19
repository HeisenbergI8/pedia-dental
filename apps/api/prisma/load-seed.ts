import "../src/clinic-time";
import "reflect-metadata";
import { Hasher } from "../src/auth/hashing";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedDatabase } from "../src/seed/seed-database";
import { LOAD_PATIENTS, loadPlatform } from "../test/load/load-data";

/**
 * `pnpm --filter api load:seed`: the load test's database (B13c1 E9). Only a database whose name ends in `_load`, so
 * neither the dev database nor a deployment can be filled with 5,000 fake children. Fresh database first, as db:seed.
 */
const env = loadEnv();
const name = new URL(env.DATABASE_URL).pathname.slice(1);
if (!name.endsWith("_load")) throw new Error(`Refusing to load-seed "${name}": the database name must end in _load.`);
const prisma = new PrismaService(env);
try {
  const n = Number(process.env.LOAD_PATIENTS ?? LOAD_PATIENTS);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, loadPlatform(n)); // no files: the load test opens none
  console.log(`Seeded the demo clinics with ${n} more patients in Bulilit.`);
} finally {
  await prisma.onModuleDestroy();
}
