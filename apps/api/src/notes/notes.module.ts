import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PlanModule } from "../plan/plan.module";
import { VisitsModule } from "../visits/visits.module";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

/** Note templates (B3) and clinical notes (B6). Signing completes plan items through PlanService. */
@Module({ imports: [AuditModule, VisitsModule, PlanModule], controllers: [NotesController], providers: [NotesService], exports: [NotesService] })
export class NotesModule {}
