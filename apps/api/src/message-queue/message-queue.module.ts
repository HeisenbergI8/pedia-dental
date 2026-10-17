import { Module } from "@nestjs/common";
import { ENV, type Env } from "../config/env";
import { OutboxModule } from "../outbox/outbox.module";
import { LogSmsProvider } from "./log-sms.provider";
import { MessageQueueService } from "./message-queue.service";
import { MessageSendHandler } from "./message-send.handler";
import { SemaphoreSmsProvider } from "./semaphore-sms.provider";
import { SMS_PROVIDER } from "./sms-provider";

/** Leaf module (E1): Prisma and the outbox only, so Patients, Appointments, Notes and Messages can all import it. */
@Module({
  imports: [OutboxModule],
  providers: [
    MessageQueueService,
    MessageSendHandler,
    // Decision 11: the log driver until a key is configured, production included.
    { provide: SMS_PROVIDER, inject: [ENV], useFactory: (env: Env) => (env.SEMAPHORE_API_KEY ? new SemaphoreSmsProvider(env) : new LogSmsProvider()) },
  ],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
