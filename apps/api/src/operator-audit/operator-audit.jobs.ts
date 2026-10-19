import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ENV, type Env } from "../config/env";
import { type Job, JobRunner } from "../jobs/job-runner";
import { OperatorAuditService } from "./operator-audit.service";

/** Daily at 03:25 Manila. */
export const OPERATOR_AUDIT_PRUNE: Job = { name: "operator-audit.prune", leaseMs: 30 * 60_000 };

/** B13c2a: prunes the operator trail only once OPERATOR_AUDIT_KEEP_DAYS is set (confirm with counsel first). */
@Injectable()
export class OperatorAuditJobs {
  private readonly log = new Logger(OperatorAuditJobs.name);
  constructor(private readonly jobs: JobRunner, private readonly trail: OperatorAuditService, @Inject(ENV) private readonly env: Env) {}

  @Cron("25 3 * * *", { name: OPERATOR_AUDIT_PRUNE.name, timeZone: "Asia/Manila" })
  prune() {
    const keepDays = this.env.OPERATOR_AUDIT_KEEP_DAYS;
    if (keepDays === undefined) return; // off: nothing is deleted until a period is confirmed
    return this.jobs.run(OPERATOR_AUDIT_PRUNE, async () => {
      const n = await this.trail.prune(keepDays);
      this.log.log(`Operator audit rows older than ${keepDays} days pruned: ${n}`);
    });
  }
}
