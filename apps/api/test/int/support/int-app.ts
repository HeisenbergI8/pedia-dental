import "reflect-metadata";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { Clock, type FixedClock } from "../../../src/common/clock";
import { loadEnv } from "../../../src/config/env";

type Options = { controllers?: Type[]; clock?: FixedClock; env?: NodeJS.ProcessEnv; background?: boolean };

/**
 * The real AppModule on the test database: nothing faked but, optionally, the clock. Mirrors main.ts's setup, except
 * that crons and the outbox loop start only with `background: true`. Tests call jobs and `drain()` directly.
 */
export async function createIntApp({ controllers = [], clock, env = {}, background = false }: Options = {}): Promise<INestApplication> {
  const config = loadEnv({ DATABASE_URL: process.env.DATABASE_URL, LOG_LEVEL: "silent", ...env });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(config, { background })], controllers });
  if (clock) builder = builder.overrideProvider(Clock).useValue(clock);
  const app = (await builder.compile()).createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.init();
  return app;
}
