import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { VisitsModule } from "../visits/visits.module";
import { ChartController } from "./chart.controller";
import { ChartService } from "./chart.service";

/** The dental chart (B5): append-only entries. Exports nothing yet; B6's plan items read entries through ChartService. */
@Module({ imports: [AuditModule, VisitsModule], controllers: [ChartController], providers: [ChartService] })
export class ChartModule {}
