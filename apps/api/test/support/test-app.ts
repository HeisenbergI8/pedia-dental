import "reflect-metadata";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import type { DestinationStream } from "pino";
import { AppModule } from "../../src/app.module";
import { AccessGuard } from "../../src/auth/access.guard";
import { loadEnv } from "../../src/config/env";
import { configureHttp } from "../../src/http-setup";
import { PrismaService } from "../../src/prisma/prisma.service";

const fakePrisma = { $queryRaw: async () => [{ 1: 1 }], $disconnect: async () => {} };
/** Lets every request through: for tests of plumbing (/probe, /echo), never of access. */
export const OPEN_GUARD = { canActivate: () => true };

type Options = { controllers?: Type[]; logStream?: DestinationStream; openGuard?: boolean; env?: NodeJS.ProcessEnv };

/** The real AppModule with a fake database, as `pnpm run check` requires (CONVENTIONS → Traps). */
export async function createTestApp({ controllers = [], logStream, openGuard = false, env: extra = {} }: Options = {}): Promise<INestApplication> {
  const env = loadEnv({ DATABASE_URL: "mysql://unused", LOG_LEVEL: logStream ? "info" : "silent", ...extra });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env, { logStream })], controllers })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma);
  if (openGuard) builder = builder.overrideProvider(AccessGuard).useValue(OPEN_GUARD);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureHttp(app, env);
  await app.init();
  return app;
}
