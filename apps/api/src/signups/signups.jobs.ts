import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { SignupsService } from "./signups.service";

/** Daily at 03:15 Manila; a 30-minute lease ends long before the next run (the job trap). */
export const PURGE: Job = { name: "signups.purge-rejected-files", leaseMs: 30 * 60_000 };

@Injectable()
export class SignupsJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly signups: SignupsService,
  ) {}

  /** B12 decision 15: rejected sign-ups' files, 30 days after the rejection. */
  @Cron("15 3 * * *", { name: PURGE.name, timeZone: "Asia/Manila" })
  purge() {
    return this.jobs.run(PURGE, () => this.signups.purgeRejectedFiles());
  }
}
