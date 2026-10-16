import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ClinicModule } from "../clinic/clinic.module";
import { PatientsModule } from "../patients/patients.module";
import { RecallsModule } from "../recalls/recalls.module";
import { AppointmentRequestsService } from "./appointment-requests.service";
import { AppointmentRecordsModule } from "./appointment-records.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

/** Appointments (B7): book, move, status and the calendar; parents' requests. The table itself is AppointmentRecordsService's (E4). */
@Module({ imports: [AuditModule, AuthModule, ClinicModule, AppointmentRecordsModule, PatientsModule, RecallsModule], controllers: [AppointmentsController], providers: [AppointmentsService, AppointmentRequestsService] })
export class AppointmentsModule {}
