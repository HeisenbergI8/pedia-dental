import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import type { DestinationStream } from "pino";
import { AuthModule } from "./auth/auth.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { RecallsModule } from "./recalls/recalls.module";
import { ReportsModule } from "./reports/reports.module";
import { BillingRecordsModule } from "./billing-records/billing-records.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";
import { BillingModule } from "./billing/billing.module";
import { ChartModule } from "./chart/chart.module";
import { GrowthModule } from "./growth/growth.module";
import { PlanModule } from "./plan/plan.module";
import { ClinicModule } from "./clinic/clinic.module";
import { ENV, type Env } from "./config/env";
import { Clock, SystemClock } from "./common/clock";
import { HttpErrorFilter } from "./common/http-error.filter";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { HealthController } from "./health/health.controller";
import { Readiness } from "./health/readiness";
import { BACKGROUND } from "./jobs/job-runner";
import { JobsModule } from "./jobs/jobs.module";
import { loggerParams } from "./logging/logger";
import { MessagesModule } from "./messages/messages.module";
import { LegalModule } from "./legal/legal.module";
import { PatientsModule } from "./patients/patients.module";
import { VisitsModule } from "./visits/visits.module";
import { NotesModule } from "./notes/notes.module";
import { OutboxModule } from "./outbox/outbox.module";
import { StorageModule } from "./storage/storage.module";
import { PhotosModule } from "./photos/photos.module";
import { PortalModule } from "./portal/portal.module";
import { DocumentsModule } from "./documents/documents.module";
import { MetricsMiddleware } from "./metrics/metrics.middleware";
import { MetricsModule } from "./metrics/metrics.module";
import { OperatorAuditModule } from "./operator-audit/operator-audit.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PlatformSettingsModule } from "./platform-settings/platform-settings.module";
import { SignupsModule } from "./signups/signups.module";
import { OperatorModule } from "./operator/operator.module";
import { ClinicBillingModule } from "./clinic-billing/clinic-billing.module";

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
        MetricsModule,
        OperatorAuditModule,
        JobsModule,
        // Without ScheduleModule, `@Cron` methods are inert: they still run when called (test/int/jobs.int.test.ts).
        ...(background ? [ScheduleModule.forRoot()] : []),
        OutboxModule,
        StorageModule,
        PhotosModule,
        DocumentsModule,
        AuthModule,
        PortalModule,
        ClinicModule,
        NotesModule,
        MessagesModule,
        PatientsModule,
        VisitsModule,
        ChartModule,
        GrowthModule,
        PlanModule,
        AppointmentsModule,
        RecallsModule,
        ReportsModule,
        IdempotencyModule,
        BillingRecordsModule,
        BillingModule,
        LegalModule,
        // B12: Primolar's billing. The QR image route comes before SignupsModule's /signups/:reference.
        PlatformSettingsModule,
        SignupsModule,
        OperatorModule,
        ClinicBillingModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: BACKGROUND, useValue: background },
        { provide: Clock, useClass: SystemClock },
        { provide: APP_FILTER, useClass: HttpErrorFilter },
        Readiness,
      ],
      exports: [ENV, Clock, BACKGROUND],
    };
  }

  /** Every route runs inside a request context (CONVENTIONS → Stateless instances), and is timed (B13a metrics). */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, MetricsMiddleware).forRoutes({ path: "{*splat}", method: RequestMethod.ALL });
  }
}
