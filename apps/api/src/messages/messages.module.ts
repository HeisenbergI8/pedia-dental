import { OutboxModule } from "../outbox/outbox.module";
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MessageQueueModule } from "../message-queue/message-queue.module";
import { PatientsModule } from "../patients/patients.module";
import { RecallsModule } from "../recalls/recalls.module";
import { MessagesController } from "./messages.controller";
import { MessagesJobs } from "./messages.jobs";
import { MessagesService } from "./messages.service";

/** Templates (B3), the log, the recall text, the birthday greeting and its daily job (B9). Texts themselves are MessageQueueService's. */
@Module({ imports: [AuditModule, AuthModule, PatientsModule, RecallsModule, MessageQueueModule, OutboxModule], controllers: [MessagesController], providers: [MessagesService, MessagesJobs], exports: [MessagesService] })
export class MessagesModule {}
