import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { IdempotencyService } from "./idempotency.service";

/** Hourly. The 30-minute lease outlasts a run and ends before the next tick. */
export const IDEMPOTENCY_SWEEP: Job = { name: "idempotency.sweep", leaseMs: 30 * 60_000 };

/** Deletes Idempotency-Keys past their 24 hours (B8 E2). Idempotent. */
@Injectable()
export class IdempotencyJobs {
  constructor(private readonly jobs: JobRunner, private readonly keys: IdempotencyService) {}

  @Cron("17 * * * *", { name: IDEMPOTENCY_SWEEP.name }) // off the hour, like every other job
  sweep() {
    return this.jobs.run(IDEMPOTENCY_SWEEP, () => this.keys.sweep());
  }
}
