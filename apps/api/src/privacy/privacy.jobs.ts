import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type RetentionPeriods, retentionConfirmed } from "@pedia/shared";
import { ENV, type Env } from "../config/env";
import { type Job, JobRunner } from "../jobs/job-runner";
import { ErasureService } from "./erasure.service";

/** Daily at 03:30 Manila (after operator-audit.prune at 03:25). 50 short transactions fit the lease many times over. */
export const PRIVACY_ANONYMISE: Job = { name: "privacy.anonymise", leaseMs: 30 * 60_000 };
/** The periods the job uses: RECORD_RETENTION in the app (privacy.module.ts); injected only so a test can confirm them. */
export const RETENTION_PERIODS = Symbol("RETENTION_PERIODS");

/** B13c2b-2 (D2): anonymises only with RETENTION_ERASURE on AND the periods confirmed (counsel). Otherwise it never starts. */
@Injectable()
export class PrivacyJobs {
  private readonly log = new Logger(PrivacyJobs.name);
  constructor(
    private readonly jobs: JobRunner,
    private readonly erasure: ErasureService,
    @Inject(ENV) private readonly env: Env,
    @Inject(RETENTION_PERIODS) private readonly periods: RetentionPeriods,
  ) {}

  @Cron("30 3 * * *", { name: PRIVACY_ANONYMISE.name, timeZone: "Asia/Manila" })
  anonymise() {
    if (!this.env.RETENTION_ERASURE || !retentionConfirmed(this.periods)) return; // off: nothing is anonymised
    return this.jobs.run(PRIVACY_ANONYMISE, async () => {
      const n = await this.erasure.anonymiseDue(this.periods);
      this.log.log(`Restricted records anonymised: ${n}`); // a count only, never a child
    });
  }
}
