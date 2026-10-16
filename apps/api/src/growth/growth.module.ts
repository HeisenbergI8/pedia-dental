import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { VisitsModule } from "../visits/visits.module";
import { GrowthController } from "./growth.controller";
import { GrowthService } from "./growth.service";

/** Growth and development (B6): one record per visit. Owns GrowthRecord; reads visits through VisitsService. */
@Module({ imports: [AuditModule, VisitsModule], controllers: [GrowthController], providers: [GrowthService] })
export class GrowthModule {}
