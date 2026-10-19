import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { ChartModule } from "../chart/chart.module";
import { ClinicModule } from "../clinic/clinic.module";
import { DocumentsModule } from "../documents/documents.module";
import { GrowthModule } from "../growth/growth.module";
import { MessagesModule } from "../messages/messages.module";
import { NotesModule } from "../notes/notes.module";
import { PatientsModule } from "../patients/patients.module";
import { PhotosModule } from "../photos/photos.module";
import { PlanModule } from "../plan/plan.module";
import { VisitsModule } from "../visits/visits.module";
import { RecordsCopyController } from "./records-copy.controller";
import { RecordsCopyService } from "./records-copy.service";

/** B13c2a: a leaf that reads through twelve owners; nothing imports it, so it can't close a cycle. */
@Module({
  imports: [AuditModule, ClinicModule, PatientsModule, VisitsModule, ChartModule, NotesModule, GrowthModule, PlanModule, AppointmentsModule, BillingModule, MessagesModule, PhotosModule, DocumentsModule],
  controllers: [RecordsCopyController],
  providers: [RecordsCopyService],
})
export class RecordsCopyModule {}
