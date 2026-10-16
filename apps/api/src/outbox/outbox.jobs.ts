import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Clock } from "../common/clock";
import { type Job, JobRunner } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";

/** Daily; the hour-long lease ends long before the next run. */
export const OUTBOX_PRUNE: Job = { name: "outbox.prune", leaseMs: 60 * 60_000 };
/** Sent rows are kept a week for diagnosis. Failed rows stay: they are B9's dead letters. */
export const KEEP_DONE_DAYS = 7;

@Injectable()
export class OutboxJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  @Cron("10 3 * * *", { name: OUTBOX_PRUNE.name, timeZone: "Asia/Manila" })
  prune() {
    return this.jobs.run(OUTBOX_PRUNE, async () => {
      const before = new Date(this.clock.now().getTime() - KEEP_DONE_DAYS * 24 * 60 * 60_000);
      await this.prisma.outboxMessage.deleteMany({ where: { status: "done", processedAt: { lt: before } } });
    });
  }
}
