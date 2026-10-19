import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { VisitsModule } from "../visits/visits.module";
import { ChartController } from "./chart.controller";
import { ChartService } from "./chart.service";

/** The dental chart (B5): append-only entries. Exports ChartService for the copy of records (B13c2a). */
@Module({ imports: [AuditModule, VisitsModule], controllers: [ChartController], providers: [ChartService], exports: [ChartService] })
export class ChartModule {}
