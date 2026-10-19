import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ClinicModule } from "../clinic/clinic.module";
import { VisitsController } from "./visits.controller";
import { VisitsService } from "./visits.service";

/** Visits (B5). ChartModule reads a visit through VisitsService; PatientsModule reads last visits through VisitDaysModule. */
@Module({ imports: [AuthModule, AuditModule, ClinicModule, AppointmentRecordsModule], controllers: [VisitsController], providers: [VisitsService], exports: [VisitsService] })
export class VisitsModule {}
