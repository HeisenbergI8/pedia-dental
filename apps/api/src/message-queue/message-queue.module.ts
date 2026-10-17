import { Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { MessageQueueService } from "./message-queue.service";

/** Leaf module (E1): Prisma and the outbox only, so Patients, Appointments, Notes and Messages can all import it. */
@Module({
  imports: [OutboxModule],
  providers: [MessageQueueService],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
