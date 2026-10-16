import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ClinicModule } from "../clinic/clinic.module";
import { AppointmentRecordsModule } from "./appointment-records.module";
import { AppointmentsController } from "./appointments.controller";
import { AppointmentsService } from "./appointments.service";

/** Appointments (B7): book, move, status and the calendar. The table itself is AppointmentRecordsService's (E4). */
@Module({ imports: [AuditModule, ClinicModule, AppointmentRecordsModule], controllers: [AppointmentsController], providers: [AppointmentsService] })
export class AppointmentsModule {}
