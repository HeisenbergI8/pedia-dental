import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ACCOUNT_TEXT_KINDS, FAILURE } from "@pedia/shared";
import { Clock, manilaDate } from "../common/clock";
import { requestContext } from "../common/request-context";
import { type Job, JobRunner } from "../jobs/job-runner";
import { MESSAGE_SEND } from "../message-queue/message.rows";
import { OutboxService } from "../outbox/outbox.service";
import { STANDING_REFRESH } from "../patients/standing-refresh";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { MessagesService } from "./messages.service";

/** Daily; an hour's lease ends long before the next run (B1-c decision 4). */
export const BIRTHDAYS: Job = { name: "messages.birthdays", leaseMs: 60 * 60_000 };

@Injectable()
export class MessagesJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly messages: MessagesService,
    private readonly outbox: OutboxService,
  ) {}

  /** Decision 8: each morning, just inside sending hours (decision 4), so greetings go at once. */
  @Cron("5 8 * * *", { name: BIRTHDAYS.name, timeZone: "Asia/Manila" })
  birthdays() {
    return this.jobs.run(BIRTHDAYS, () => this.runOnce());
  }

  /** Idempotent: a second run (or instance) finds every child greeted. Returns how many it queued (tests). */
  async runOnce(): Promise<number> {
    await this.repairDeadLetters();
    const today = manilaDate(this.clock.now());
    // Platform table, read across clinics on purpose: which clinics get greetings. Suspended clinics don't (decision 16).
    const clinics = await this.prisma.clinicAccount.findMany({ where: { status: "active" }, select: { id: true } });
    let queued = 0;
    for (const { id: clinicId } of clinics) {
      queued += await requestContext.run({ requestId: `job:${BIRTHDAYS.name}:${randomUUID()}`, operator: false, clinicId }, async () => await this.messages.greetAll(today));
    }
    return queued;
  }

  /**
   * Phase 3's repair: a text whose outbox row gave up while the dead-letter hook didn't run (a crash between the two)
   * still reads `queued`. Raw SQL across clinics, like the session sweep: names no clinic because it fixes all.
   */
  private async repairDeadLetters(): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      // B14: the children whose texts this fails get a standing.refresh ("no contact"), committed with the repair.
      const children = await tx.$queryRaw<{ clinicId: string; patientId: string }[]>`
        SELECT DISTINCT m.clinicId, m.patientId FROM Message m JOIN OutboxMessage o
          ON o.kind = ${MESSAGE_SEND} AND JSON_UNQUOTE(JSON_EXTRACT(o.payload, '$.messageId')) = m.id
        WHERE m.status = 'queued' AND o.status = 'failed' AND m.kind NOT IN (${Prisma.join([...ACCOUNT_TEXT_KINDS])})`;
      await tx.$executeRaw`
        UPDATE Message m JOIN OutboxMessage o
          ON o.kind = ${MESSAGE_SEND} AND JSON_UNQUOTE(JSON_EXTRACT(o.payload, '$.messageId')) = m.id
        SET m.status = 'failed', m.failureReason = ${FAILURE.gaveUp}, m.dispatchedAt = NULL
        WHERE m.status = 'queued' AND o.status = 'failed'`;
      for (const { clinicId, patientId } of children) await this.outbox.enqueue(tx, { kind: STANDING_REFRESH, payload: { patientId }, clinicId });
    });
  }
}
