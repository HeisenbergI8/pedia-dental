import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { SubscriptionRecordsService } from "./subscription-records.service";

/** Nightly at 00:05 Manila; a 30-minute lease is longer than a run and far shorter than a day (the job trap). */
export const SETTLE: Job = { name: "subscriptions.settle", leaseMs: 30 * 60_000 };

@Injectable()
export class SubscriptionsJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly records: SubscriptionRecordsService,
  ) {}

  /** S2, decision 4: downgrades whose date has come, and pauses for lapsed or ended subscriptions. Sign-in checks too. */
  @Cron("5 0 * * *", { name: SETTLE.name, timeZone: "Asia/Manila" })
  settle() {
    return this.jobs.run(SETTLE, () => this.records.settleAll());
  }
}
