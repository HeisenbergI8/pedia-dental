import "../src/clinic-time"; // first: a visit's day and dueOn are Manila days
import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { requestContext } from "../src/common/request-context";
import { loadEnv } from "../src/config/env";
import { NotesService } from "../src/notes/notes.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { runInTransaction } from "../src/prisma/transaction";
import { DueItemsService } from "../src/recalls/due-items.service";

/**
 * `pnpm --filter api db:backfill-due-items`: once per database after deploying B7 (E8). Opens the due items of notes
 * signed on the API before B7. Idempotent: run it again and it creates nothing.
 */
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadEnv()), { logger: false });
try {
  const prisma = app.get(PrismaService);
  const notes = app.get(NotesService);
  const due = app.get(DueItemsService);
  for (const { id } of await prisma.clinicAccount.findMany({ select: { id: true }, orderBy: { id: "asc" } })) {
    const made = await requestContext.run({ requestId: `backfill-due-items-${id}`, clinicId: id, operator: false }, async () =>
      await runInTransaction(prisma, async (tx) => due.backfill(tx, await notes.signedForBackfill(tx))));
    console.log(`${id}: ${made} due item(s) opened`);
  }
} finally {
  await app.close();
}
