import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ClinicModule } from "../clinic/clinic.module";
import { PlanController } from "./plan.controller";
import { PlanService } from "./plan.service";

/** The treatment plan (B6). Exports PlanService: NotesService.sign completes items through completeBy. */
@Module({ imports: [AuditModule, ClinicModule], controllers: [PlanController], providers: [PlanService], exports: [PlanService] })
export class PlanModule {}
