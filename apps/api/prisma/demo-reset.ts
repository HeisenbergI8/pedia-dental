import "../src/clinic-time"; // first: the seed's setHours(day, 9) is 9:00 in Manila on any machine
import "reflect-metadata";
import { existsSync } from "node:fs";
import { Hasher } from "../src/auth/hashing";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDemo } from "../src/seed/demo-reset";
import { fileStorageOf } from "../src/storage/file-storage";

/** `pnpm --filter api db:demo-reset`: empties a demo database and seeds the demo clinics as of today (B13c1 E5). */
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const env = loadEnv();
const prisma = new PrismaService(env);
try {
  await resetDemo(prisma, new Hasher(), env, fileStorageOf(env));
  console.log("Reset the demo clinics.");
} finally {
  await prisma.onModuleDestroy();
}
