import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { RateLimitService } from "./rate-limit";
import { SessionService } from "./session.service";

/** Every 15 minutes. The 10-minute lease outlasts the run and ends before the next tick (B1-c plan, decision 4). */
export const AUTH_SWEEP: Job = { name: "auth.sweep", leaseMs: 10 * 60_000 };

/** B2's deferred sweeps: expired sessions and ended rate-limit windows. Both deletes are idempotent. */
@Injectable()
export class AuthJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
  ) {}

  @Cron("*/15 * * * *", { name: AUTH_SWEEP.name })
  sweep() {
    return this.jobs.run(AUTH_SWEEP, async () => {
      await this.sessions.sweepExpired();
      await this.limits.sweep();
    });
  }
}
