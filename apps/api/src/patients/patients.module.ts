import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalModule } from "../legal/legal.module";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { FamilyModule } from "./family.module";
import { PatientWritesService } from "./patient-writes.service";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";

/** The child's record (B4). B5–B8 read patients through PatientsService, never its tables. */
@Module({ imports: [AuditModule, FamilyModule, LegalModule, StorageModule, OutboxModule, VisitDaysModule], controllers: [PatientsController], providers: [PatientsService, PatientWritesService], exports: [PatientsService] })
export class PatientsModule {}
