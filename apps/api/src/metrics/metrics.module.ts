import { Global, Module } from "@nestjs/common";
import { MetricsMiddleware } from "./metrics.middleware";
import { MetricsService } from "./metrics.service";

/** B13a: the process's metrics, global so HttpErrorFilter and main.ts reach them. */
@Global()
@Module({ providers: [MetricsService, MetricsMiddleware], exports: [MetricsService] })
export class MetricsModule {}
