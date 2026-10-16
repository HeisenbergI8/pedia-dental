import { Module } from "@nestjs/common";
import { NoopHandler, OutboxHandlers } from "./outbox.handlers";
import { OutboxJobs } from "./outbox.jobs";
import { OutboxService } from "./outbox.service";
import { OutboxWorker } from "./outbox.worker";

/**
 * The outbox (CONVENTIONS → Side effects). A feature imports this module to enqueue, and registers its handlers with
 * `OutboxHandlers`. Imported once by AppModule so the worker runs.
 */
@Module({
  providers: [OutboxHandlers, NoopHandler, OutboxService, OutboxWorker, OutboxJobs],
  exports: [OutboxService, OutboxHandlers],
})
export class OutboxModule {}
