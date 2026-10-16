import "reflect-metadata";
import type { INestApplication, Type } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { Clock, type FixedClock } from "../../../src/common/clock";
import { loadEnv } from "../../../src/config/env";

type Options = { controllers?: Type[]; clock?: FixedClock; env?: NodeJS.ProcessEnv };

/** The real AppModule on the test database: nothing faked but, optionally, the clock. Mirrors main.ts's setup. */
export async function createIntApp({ controllers = [], clock, env = {} }: Options = {}): Promise<INestApplication> {
  const config = loadEnv({ DATABASE_URL: process.env.DATABASE_URL, LOG_LEVEL: "silent", ...env });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(config)], controllers });
  if (clock) builder = builder.overrideProvider(Clock).useValue(clock);
  const app = (await builder.compile()).createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.init();
  return app;
}
