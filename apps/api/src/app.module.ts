import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import type { DestinationStream } from "pino";
import { AuthModule } from "./auth/auth.module";
import { ClinicModule } from "./clinic/clinic.module";
import { ENV, type Env } from "./config/env";
import { Clock, SystemClock } from "./common/clock";
import { HttpErrorFilter } from "./common/http-error.filter";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { HealthController } from "./health/health.controller";
import { loggerParams } from "./logging/logger";
import { PrismaModule } from "./prisma/prisma.module";

@Module({})
export class AppModule implements NestModule {
  /** `logStream` is for tests that read log lines; leave it out everywhere else. */
  static forRoot(env: Env, { logStream }: { logStream?: DestinationStream } = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [LoggerModule.forRoot(loggerParams(env, logStream)), PrismaModule, AuthModule, ClinicModule],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: Clock, useClass: SystemClock },
        { provide: APP_FILTER, useClass: HttpErrorFilter },
      ],
      exports: [ENV, Clock],
    };
  }

  /** Every route runs inside a request context (CONVENTIONS → Stateless instances). */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: "{*splat}", method: RequestMethod.ALL });
  }
}
