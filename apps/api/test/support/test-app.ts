import "reflect-metadata";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import type { DestinationStream } from "pino";
import { AppModule } from "../../src/app.module";
import { loadEnv } from "../../src/config/env";
import { PrismaService } from "../../src/prisma/prisma.service";

const fakePrisma = { $queryRaw: async () => [{ 1: 1 }], $disconnect: async () => {} };

type Options = { controllers?: Type[]; logStream?: DestinationStream };

/** The real AppModule with a fake database, as `pnpm run check` requires (CONVENTIONS → Traps). */
export async function createTestApp({ controllers = [], logStream }: Options = {}): Promise<INestApplication> {
  const env = loadEnv({ DATABASE_URL: "mysql://unused", LOG_LEVEL: logStream ? "info" : "silent" });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env, { logStream })], controllers })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma)
    .compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  await app.init();
  return app;
}
