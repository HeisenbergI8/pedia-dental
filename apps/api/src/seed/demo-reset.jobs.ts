import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Hasher } from "../auth/hashing";
import { ENV, type Env } from "../config/env";
import { type Job, JobRunner } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";
import { fileStorageOf } from "../storage/file-storage";
import { resetDemo } from "./demo-reset";

/** Nightly at 03:40 Manila, after the 03:15 sign-up purge; a 30-minute lease ends long before the next run. */
export const DEMO_RESET: Job = { name: "demo.reset", leaseMs: 30 * 60_000 };

/** B13c1 E5: only registered when DEMO_DAILY_RESET is on (AppModule.forRoot), which env.ts allows only on a demo. */
@Injectable()
export class DemoResetJobs implements OnApplicationBootstrap {
  constructor(
    private readonly jobs: JobRunner,
    private readonly prisma: PrismaService,
    private readonly hasher: Hasher,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * A demo database with no clinic yet (just deployed and migrated) is seeded at once, not at 03:40. So is one whose last
   * reset started and never finished (a failed seed leaves a half-seeded demo, e.g. accounts without logins): the job
   * runner stamps lastFinishedAt only on success.
   */
  async onApplicationBootstrap() {
    const lock = await this.prisma.jobLock.findUnique({ where: { name: DEMO_RESET.name }, select: { lastStartedAt: true, lastFinishedAt: true } });
    const unfinished = !!lock?.lastStartedAt && (!lock.lastFinishedAt || lock.lastFinishedAt < lock.lastStartedAt);
    if (unfinished || (await this.prisma.clinicAccount.count()) === 0) await this.reset();
  }

  @Cron("40 3 * * *", { name: DEMO_RESET.name, timeZone: "Asia/Manila" })
  reset() {
    return this.jobs.run(DEMO_RESET, () => resetDemo(this.prisma, this.hasher, this.env, fileStorageOf(this.env)));
  }
}
