import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AppointmentsModule } from "../appointments/appointments.module";
import { ClinicModule } from "../clinic/clinic.module";
import { PatientsModule } from "../patients/patients.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { BillingRecordsModule } from "../billing-records/billing-records.module";
import { CollectionsController } from "./collections.controller";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/** The dashboard's reports (features/dashboard), under the route's name. Today, the financial report and the day's collections. */
@Module({ imports: [AppointmentRecordsModule, VisitDaysModule, PatientsModule, ClinicModule, AppointmentsModule, BillingRecordsModule], controllers: [ReportsController, CollectionsController], providers: [ReportsService] })
export class ReportsModule {}
