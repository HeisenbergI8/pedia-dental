import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { type Job, JobRunner } from "../jobs/job-runner";
import { PortalService } from "./portal.service";

/** Daily at 03:20 Manila; the 30-minute lease ends long before the next run. */
export const PORTAL_LINK_PRUNE: Job = { name: "portal.prune-links", leaseMs: 30 * 60_000 };

/** B13c2a: the retention schedule's portal-link prune. Idempotent. */
@Injectable()
export class PortalJobs {
  constructor(private readonly jobs: JobRunner, private readonly portal: PortalService) {}

  @Cron("20 3 * * *", { name: PORTAL_LINK_PRUNE.name, timeZone: "Asia/Manila" })
  prune() {
    return this.jobs.run(PORTAL_LINK_PRUNE, () => this.portal.pruneLinks());
  }
}
