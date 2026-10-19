import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AuthModule } from "../auth/auth.module";
import { VisitsModule } from "../visits/visits.module";
import { DueItemsService } from "./due-items.service";
import { RecallsController } from "./recalls.controller";

/** Follow-ups and recalls (B7): the due list. Signing opens items (NotesService), booking takes them (AppointmentsService). */
@Module({ imports: [AppointmentRecordsModule, AuthModule, VisitsModule], controllers: [RecallsController], providers: [DueItemsService], exports: [DueItemsService] })
export class RecallsModule {}
