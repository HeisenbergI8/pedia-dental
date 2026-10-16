import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ClinicModule } from "../clinic/clinic.module";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

/** Visits (B5). ChartModule reads a visit through VisitsService; PatientsModule reads last visits through VisitDaysModule. */
@Module({ imports: [AuditModule, ClinicModule], controllers: [VisitsController], providers: [VisitsService], exports: [VisitsService] })
export class VisitsModule {}
