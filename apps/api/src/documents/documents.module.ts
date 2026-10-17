import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { BillingRecordsModule } from "../billing-records/billing-records.module";
import { ClinicModule } from "../clinic/clinic.module";
import { NotesModule } from "../notes/notes.module";
import { PatientsModule } from "../patients/patients.module";
import { VisitsModule } from "../visits/visits.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

/** B10: the issued-documents log. A leaf: it reads through five owners and nothing imports it. */
@Module({ imports: [AuditModule, PatientsModule, VisitsModule, NotesModule, BillingRecordsModule, ClinicModule], controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
