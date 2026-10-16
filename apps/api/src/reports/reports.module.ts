import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ClinicModule } from "../clinic/clinic.module";
import { PatientsModule } from "../patients/patients.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/** The dashboard's reports (features/dashboard), under the route's name. B8 adds /reports/finance here. */
@Module({ imports: [AppointmentRecordsModule, VisitDaysModule, PatientsModule, ClinicModule, AppointmentsModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
