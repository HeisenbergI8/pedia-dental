import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { Injectable, Logger } from "@nestjs/common";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";

/** True in the process that runs crons and the outbox loop (`AppModule.forRoot(env, { background })`). */
export const BACKGROUND = Symbol("BACKGROUND");

/** A scheduled job. `leaseMs` is longer than a run and shorter than the cron period (B1-c plan, decision 4). */
export type Job = { name: string; leaseMs: number };

/** A new job's lease row starts expired. */
const NEVER = new Date(0);

/**
 * Runs a scheduled job on one instance per tick (CONVENTIONS → Side effects: jobs take a DB lock). The lease is kept
 * after a successful run, so an instance whose cron fires a moment later skips. A failed run releases it, so the next
 * tick retries. Jobs are idempotent, so the rare double run (a run longer than its lease) is harmless.
 */
@Injectable()
export class JobRunner {
  private readonly log = new Logger(JobRunner.name);
  /** One per app instance: two int-test apps in one process are two holders. */
  readonly holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`.slice(0, 191);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async run(job: Job, fn: () => Promise<unknown>): Promise<"ran" | "skipped" | "failed"> {
    if (!(await this.acquire(job))) return "skipped";
    const requestId = `job:${job.name}:${randomUUID()}`;
    const mine = { name: job.name, lockedBy: this.holder };
    try {
      // Awaited inside: Prisma queries are lazy (CONVENTIONS → Traps).
      await requestContext.run({ requestId, operator: false }, async () => await fn());
      await this.prisma.jobLock.updateMany({ where: mine, data: { lastFinishedAt: this.clock.now() } });
      return "ran";
    } catch (error) {
      // The name only: a Prisma error's message quotes its arguments.
      this.log.error(`Scheduled job ${job.name} failed (${error instanceof Error ? error.name : "Error"}), ${requestId}`);
      await this.prisma.jobLock.updateMany({ where: mine, data: { lockedUntil: this.clock.now() } });
      return "failed";
    }
  }

  /**
   * Raw SQL on a platform table: a lock, not a model query. INSERT IGNORE creates the row on a job's first run. The
   * UPDATE is atomic under InnoDB's row lock, so of two instances at one tick exactly one matches. It always changes
   * `lockedUntil` when it matches, so the mariadb driver's affected-rows count is 1 whether it counts found or changed rows.
   */
  private async acquire({ name, leaseMs }: Job): Promise<boolean> {
    const now = this.clock.now();
    await this.prisma.$executeRaw`INSERT IGNORE INTO JobLock (name, lockedUntil, lockedBy) VALUES (${name}, ${NEVER}, '')`;
    const taken = await this.prisma.$executeRaw`
      UPDATE JobLock SET lockedUntil = ${new Date(now.getTime() + leaseMs)}, lockedBy = ${this.holder}, lastStartedAt = ${now}
      WHERE name = ${name} AND lockedUntil <= ${now}`;
    return taken === 1;
  }
}
