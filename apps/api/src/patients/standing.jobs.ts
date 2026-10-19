import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { requestContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { BACKGROUND, type Job, JobRunner } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { PatientStandingService } from "./patient-standing.service";

/** Nightly at 03:35 Manila, and once at start-up; the 30-minute lease ends long before the next run. */
export const STANDING_RECONCILE: Job = { name: "standing.reconcile", leaseMs: 30 * 60_000 };
const BATCH = 200;

/**
 * B14 (D5): recomputes every patient's stored standing from source and logs how many rows were wrong. The start-up run
 * is the production backfill; non-zero drift afterwards means a write path is missing its StandingRefresh hook.
 */
@Injectable()
export class StandingJobs implements OnApplicationBootstrap {
  private readonly log = new Logger(StandingJobs.name);

  constructor(
    private readonly jobs: JobRunner,
    private readonly prisma: PrismaService,
    private readonly standing: PatientStandingService,
    @Inject(BACKGROUND) private readonly background: boolean,
  ) {}

  /** Not awaited: start-up doesn't wait for it, and the list shows the defaults until it finishes (D5). */
  onApplicationBootstrap() {
    if (this.background) void this.reconcile();
  }

  @Cron("35 3 * * *", { name: STANDING_RECONCILE.name, timeZone: "Asia/Manila" })
  reconcile() {
    return this.jobs.run(STANDING_RECONCILE, async () => {
      const drifted = await reconcileAll(this.prisma, this.standing);
      this.log.log(`Stored standing reconciled: ${drifted} patient row(s) corrected`); // counts only, never ids
    });
  }
}

/** Every clinic, in batches of 200 patients by id, each batch in its own transaction under those patients' locks. */
export async function reconcileAll(prisma: PrismaService, standing: PatientStandingService): Promise<number> {
  let drifted = 0;
  for (const { id: clinicId } of await prisma.clinicAccount.findMany({ select: { id: true }, orderBy: { id: "asc" } })) {
    drifted += await requestContext.run({ requestId: `standing-reconcile-${clinicId}`, clinicId, operator: false }, async () => {
      let n = 0;
      for (let after = ""; ; ) {
        const ids = (await prisma.patient.findMany({ where: { id: { gt: after } }, select: { id: true }, orderBy: { id: "asc" }, take: BATCH })).map((p) => p.id);
        if (!ids.length) return n;
        after = ids.at(-1)!;
        n += await runInTransaction(prisma, async (tx) => {
          // The locks first (patient-lock.ts), in id order; no account lock, so no single-patient writer waits on two of ours.
          const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Patient WHERE clinicId = ${clinicId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
          return standing.refresh(tx, locked.map((r) => r.id));
        });
      }
    });
  }
  return drifted;
}
