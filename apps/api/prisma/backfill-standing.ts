import "../src/clinic-time"; // first: a visit's day and a done appointment's are Manila days
import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { loadEnv } from "../src/config/env";
import { PatientStandingService } from "../src/patients/patient-standing.service";
import { reconcileAll } from "../src/patients/standing.jobs";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * `pnpm --filter api db:backfill-standing`: B14's stored standing recomputed for every patient, as the start-up
 * `standing.reconcile` does (after `db:backfill-due-items`, say). Idempotent: a second run corrects nothing.
 */
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadEnv()), { logger: false });
try {
  console.log(`${await reconcileAll(app.get(PrismaService), app.get(PatientStandingService))} patient row(s) corrected`);
} finally {
  await app.close();
}
