import "reflect-metadata";
import { existsSync } from "node:fs";
import { seedPlatform } from "@pedia/seed";
import { Hasher } from "../src/auth/hashing";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";
import { seedDatabase } from "../src/seed/seed-database";

/** `pnpm --filter api db:seed`: the web's demo data, on a demo deployment only (DEMO_LOGINS=true). */
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const env = loadEnv();
const prisma = new PrismaService(env);
try {
  await seedDatabase(prisma, new Hasher(), env, seedPlatform());
  console.log("Seeded the demo clinics.");
} finally {
  await prisma.onModuleDestroy();
}
