import "reflect-metadata";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { newTotpSecret, otpauthUri } from "../src/auth/totp";
import { loadScriptEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Security review #8: enrols a Primolar operator in two-step sign-in. Writes a new TOTP secret on their OperatorUser
 * row and prints the otpauth URI once, for an authenticator app (scan it as a QR code, or paste the secret). From then
 * on /operator/auth/login wants the app's 6-digit code. API-only: no route, no MSW handler.
 *
 * Locally: `pnpm --filter api exec node --import @swc-node/register/esm-register prisma/operator-totp.ts <email>`.
 * In production: `node dist/operator-totp.mjs <email>` in a one-off run of the release task
 * (packages/infra/runbooks/first-time-setup.md). `--replace` swaps an existing secret (a lost phone); the old app
 * stops working at once.
 */
const USAGE = "Usage: operator-totp <operator email> [--replace]";
if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
const { positionals, values } = parseArgs({ allowPositionals: true, options: { replace: { type: "boolean", default: false } } });
const email = positionals[0]?.trim().toLowerCase();
if (!email || positionals.length !== 1) {
  console.error(USAGE);
  process.exit(2);
}
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadScriptEnv(process.env, { storage: false })), { logger: false });
let code = 0;
try {
  const prisma = app.get(PrismaService);
  const operator = await prisma.operatorUser.findUnique({ where: { email }, select: { id: true, totpSecret: true } });
  if (!operator) {
    console.error(`No operator signs in with ${email}.`);
    code = 1;
  } else if (operator.totpSecret && !values.replace) {
    console.error(`${email} already has two-step sign-in. Pass --replace to set up a new authenticator (the old one stops working).`);
    code = 1;
  } else {
    const secret = newTotpSecret();
    await prisma.operatorUser.update({ where: { id: operator.id }, data: { totpSecret: secret, totpLastStep: null } });
    console.log(`Two-step sign-in set up for ${email}. Add it to an authenticator app now; this is shown once.\n`);
    console.log(`  URI:    ${otpauthUri(secret, email)}`);
    console.log(`  Secret: ${secret}\n`);
    console.log("Scan the URI as a QR code, or type the secret into the app. Then sign in to the console with the app's code.");
  }
} catch (error) {
  // A Prisma error's message quotes its arguments (CONVENTIONS → Traps): print it by name only.
  console.error(`Failed (${error instanceof Error ? error.name : "Error"}). Nothing was changed.`);
  code = 1;
} finally {
  await app.close();
}
process.exit(code);
