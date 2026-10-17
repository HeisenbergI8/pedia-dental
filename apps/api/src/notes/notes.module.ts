import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MessageQueueModule } from "../message-queue/message-queue.module";
import { PatientsModule } from "../patients/patients.module";
import { PlanModule } from "../plan/plan.module";
import { RecallsModule } from "../recalls/recalls.module";
import { VisitsModule } from "../visits/visits.module";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

/** Note templates (B3) and clinical notes (B6). Signing completes plan items (PlanService) and makes follow-ups due (DueItemsService). */
@Module({ imports: [AuditModule, VisitsModule, PlanModule, RecallsModule, PatientsModule, MessageQueueModule], controllers: [NotesController], providers: [NotesService], exports: [NotesService] })
export class NotesModule {}
