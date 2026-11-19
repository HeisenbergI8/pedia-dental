import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { SignupsService } from "./signups.service";

/** Daily at 03:15 Manila; a 30-minute lease ends long before the next run (the job trap). */
export const PURGE: Job = { name: "signups.purge-rejected-files", leaseMs: 30 * 60_000 };
/** #17: daily at 03:05 Manila, before the purge; the same 30-minute lease. */
export const EXPIRE: Job = { name: "signups.expire-unpaid", leaseMs: 30 * 60_000 };

@Injectable()
export class SignupsJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly signups: SignupsService,
  ) {}

  /** #17: waiting sign-ups unpaid 14 days after they were submitted are rejected ("Not paid within 14 days"). */
  @Cron("5 3 * * *", { name: EXPIRE.name, timeZone: "Asia/Manila" })
  expire() {
    return this.jobs.run(EXPIRE, () => this.signups.expireUnpaid());
  }

  /** B12 decision 15: rejected sign-ups' files, 30 days after the rejection (an expired one's too). */
  @Cron("15 3 * * *", { name: PURGE.name, timeZone: "Asia/Manila" })
  purge() {
    return this.jobs.run(PURGE, () => this.signups.purgeRejectedFiles());
  }
}
