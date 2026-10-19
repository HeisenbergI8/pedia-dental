import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PortalModule } from "../portal/portal.module";
import { MessageQueueModule } from "../message-queue/message-queue.module";
import { LegalModule } from "../legal/legal.module";
import { OutboxModule } from "../outbox/outbox.module";
import { BillingRecordsModule } from "../billing-records/billing-records.module";
import { RecallsModule } from "../recalls/recalls.module";
import { StorageModule } from "../storage/storage.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { FamilyModule } from "./family.module";
import { PatientWritesService } from "./patient-writes.service";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";

/** The child's record (B4). B5–B8 read patients through PatientsService, never its tables. */
@Module({ imports: [AuditModule, AuthModule, PortalModule, FamilyModule, LegalModule, StorageModule, OutboxModule, VisitDaysModule, RecallsModule, BillingRecordsModule, MessageQueueModule], controllers: [PatientsController], providers: [PatientsService, PatientWritesService], exports: [PatientsService, PatientWritesService] }) // B13c2b: declineAll
export class PatientsModule {}
