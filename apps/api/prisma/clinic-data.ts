import "../src/clinic-time"; // first: "today" for the subscription check is a Manila day
import "reflect-metadata";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { loadEnv } from "../src/config/env";
import { ClinicDataRefusal, ClinicDataService } from "../src/privacy/clinic-data";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * B13c2b-2: the operator's clinic data scripts (packages/infra/runbooks/clinic-data-return.md). API-only: no route,
 * no MSW handler. Locally `pnpm --filter api db:clinic-export …`; in production `node dist/clinic-data.mjs …` in a
 * one-off run of the release task. Prints counts and keys only, never a row.
 */
const USAGE = 'Usage: clinic-data export <clinicId> <empty dir> --operator <operatorUserId>\n       clinic-data purge <clinicId> --confirm "<clinic name>" --operator <operatorUserId>';
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const { positionals, values } = parseArgs({ allowPositionals: true, options: { operator: { type: "string" }, confirm: { type: "string" } } });
const [command, clinicId, dir] = positionals;
const complete = command === "export" ? !!dir : command === "purge" ? values.confirm !== undefined : false;
if (!complete || !clinicId || !values.operator) {
  console.error(USAGE);
  process.exit(2);
}
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadEnv()), { logger: false });
let code = 0;
try {
  const operator = await app.get(PrismaService).operatorUser.findUnique({ where: { id: values.operator! }, select: { id: true, name: true } });
  if (!operator) throw new ClinicDataRefusal(`No operator ${values.operator}.`);
  const data = app.get(ClinicDataService);
  const out = command === "export" ? await data.export(clinicId, dir!, operator) : await data.purge(clinicId, values.confirm!, operator);
  console.log(JSON.stringify(out, null, 2));
} catch (error) {
  // A Prisma error's message quotes its arguments (CONVENTIONS → Traps): print our refusals in full, anything else by name.
  console.error(error instanceof ClinicDataRefusal ? error.message : `Failed (${error instanceof Error ? error.name : "Error"}). Nothing after the failure ran; re-run when fixed.`);
  code = 1;
} finally {
  await app.close();
}
process.exit(code);
