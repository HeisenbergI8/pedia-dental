import type { INestApplication } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUTH_SWEEP, AuthJobs } from "../../src/auth/auth.jobs";
import { FixedClock } from "../../src/common/clock";
import { JobRunner } from "../../src/jobs/job-runner";
import { OUTBOX_PRUNE } from "../../src/outbox/outbox.jobs";
import { resetDatabase, testPrisma } from "./support/database";
import { createIntApp } from "./support/int-app";

const NOW = new Date("2026-10-16T02:00:00.000Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const hash = (label: string) => label.padEnd(64, "0");
const label = (tokenHash: string) => tokenHash.replace(/0+$/, "");

const prisma = testPrisma();
const clock = new FixedClock(NOW);
// Two API instances on one database: B1's "Done when".
let a: INestApplication;
let b: INestApplication;

beforeAll(async () => {
  [a, b] = await Promise.all([createIntApp({ clock }), createIntApp({ clock })]);
});
afterAll(async () => {
  await Promise.all([a.close(), b.close()]);
  await prisma.onModuleDestroy();
});
beforeEach(async () => {
  clock.set(NOW);
  await resetDatabase(prisma);
});

/** Platform tables: no clinic context needed. */
async function seedExpiring() {
  const session = (l: string, lastSeenAt: Date, expiresAt: Date) => ({ tokenHash: hash(l), clinicId: "clinic_a", accountId: "acct_a", createdAt: at(-60), lastSeenAt, expiresAt });
  await prisma.session.createMany({
    data: [session("live", at(-1), at(400)), session("idle", at(-30), at(400)), session("absolute", at(-1), NOW)],
  });
  const op = (l: string, lastSeenAt: Date) => ({ tokenHash: hash(l), operatorId: "op_1", createdAt: at(-60), lastSeenAt, expiresAt: at(400) });
  await prisma.operatorSession.createMany({ data: [op("oplive", at(-1)), op("opidle", at(-45))] });
  await prisma.rateLimitCounter.createMany({
    data: [
      { bucket: "login:ended", windowStart: at(-5), hits: 3 }, // the longest window (5 min) has just ended
      { bucket: "login:open", windowStart: at(-4), hits: 3 },
    ],
  });
}

describe("scheduled jobs across two API instances", () => {
  it("run once when both instances fire the same tick, and the sweep removes only dead rows", async () => {
    await seedExpiring();
    const results = await Promise.all([a.get(AuthJobs).sweep(), b.get(AuthJobs).sweep()]);
    expect(results.sort()).toEqual(["ran", "skipped"]);

    expect((await prisma.session.findMany({ select: { tokenHash: true } })).map((s) => label(s.tokenHash))).toEqual(["live"]);
    expect((await prisma.operatorSession.findMany({ select: { tokenHash: true } })).map((s) => label(s.tokenHash))).toEqual(["oplive"]);
    expect((await prisma.rateLimitCounter.findMany({ select: { bucket: true } })).map((r) => r.bucket)).toEqual(["login:open"]);
    expect(await prisma.jobLock.findUnique({ where: { name: AUTH_SWEEP.name } })).toMatchObject({ lockedUntil: at(10), lastFinishedAt: NOW });
  });

  it("keep the lease after a run, so a late instance skips that tick, and the next tick runs", async () => {
    expect(await a.get(AuthJobs).sweep()).toBe("ran");
    clock.set(at(1)); // the other instance's cron, a minute late
    expect(await b.get(AuthJobs).sweep()).toBe("skipped");
    clock.set(at(15)); // the next tick: the 10-minute lease is over
    expect(await b.get(AuthJobs).sweep()).toBe("ran");
  });

  it("release the lease when a run fails, so the next try runs", async () => {
    const job = { name: "test.flaky", leaseMs: 10 * 60_000 };
    expect(await a.get(JobRunner).run(job, async () => Promise.reject(new Error("boom")))).toBe("failed");
    expect(await b.get(JobRunner).run(job, async () => {})).toBe("ran");
  });

  it("are scheduled only in a process started with background work", async () => {
    expect(() => a.get(SchedulerRegistry)).toThrow(); // no ScheduleModule: @Cron is inert
    const worker = await createIntApp({ clock, background: true });
    try {
      expect(worker.get(SchedulerRegistry).getCronJobs().has(AUTH_SWEEP.name)).toBe(true);
      expect(worker.get(SchedulerRegistry).getCronJobs().has(OUTBOX_PRUNE.name)).toBe(true);
    } finally {
      await worker.close();
    }
  });
});
