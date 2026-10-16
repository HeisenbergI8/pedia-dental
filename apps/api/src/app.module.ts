import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import type { DestinationStream } from "pino";
import { AuthModule } from "./auth/auth.module";
import { ClinicModule } from "./clinic/clinic.module";
import { ENV, type Env } from "./config/env";
import { Clock, SystemClock } from "./common/clock";
import { HttpErrorFilter } from "./common/http-error.filter";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { HealthController } from "./health/health.controller";
import { BACKGROUND } from "./jobs/job-runner";
import { JobsModule } from "./jobs/jobs.module";
import { loggerParams } from "./logging/logger";
import { MessagesModule } from "./messages/messages.module";
import { PatientsModule } from "./patients/patients.module";
import { NotesModule } from "./notes/notes.module";
import { OutboxModule } from "./outbox/outbox.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({})
export class AppModule implements NestModule {
  /**
   * `logStream` is for tests that read log lines. `background` starts the crons and the outbox loop: only main.ts
   * passes it (from BACKGROUND_WORK), so no test runs background work unless it asks.
   */
  static forRoot(env: Env, { logStream, background = false }: { logStream?: DestinationStream; background?: boolean } = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot(loggerParams(env, logStream)),
        PrismaModule,
        JobsModule,
        // Without ScheduleModule, `@Cron` methods are inert: they still run when called (test/int/jobs.int.test.ts).
        ...(background ? [ScheduleModule.forRoot()] : []),
        OutboxModule,
        AuthModule,
        ClinicModule,
        NotesModule,
        MessagesModule,
        PatientsModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: BACKGROUND, useValue: background },
        { provide: Clock, useClass: SystemClock },
        { provide: APP_FILTER, useClass: HttpErrorFilter },
      ],
      exports: [ENV, Clock, BACKGROUND],
    };
  }

  /** Every route runs inside a request context (CONVENTIONS → Stateless instances). */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: "{*splat}", method: RequestMethod.ALL });
  }
}
