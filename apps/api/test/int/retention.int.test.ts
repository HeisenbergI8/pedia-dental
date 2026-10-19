import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../src/common/clock";
import { OperatorAuditJobs } from "../../src/operator-audit/operator-audit.jobs";
import { KEEP_LINK_DAYS, PortalService } from "../../src/portal/portal.service";
import { TenantScopeError } from "../../src/prisma/tenant-scope";
import { resetDatabase, testPrisma } from "./support/database";
import { createIntApp } from "./support/int-app";

/** B13c2a: the retention schedule's two new prunes (decisions.md E9, E10) against MySQL. */
const NOW = new Date("2026-10-19T02:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

const prisma = testPrisma();
const clock = new FixedClock(NOW);
let off: INestApplication; // OPERATOR_AUDIT_KEEP_DAYS unset (the default)
let year: INestApplication; // OPERATOR_AUDIT_KEEP_DAYS=365

beforeAll(async () => {
  [off, year] = await Promise.all([createIntApp({ clock }), createIntApp({ clock, env: { OPERATOR_AUDIT_KEEP_DAYS: "365" } })]);
});
afterAll(async () => {
  await Promise.all([off.close(), year.close()]);
  await prisma.onModuleDestroy();
});
beforeEach(() => resetDatabase(prisma));

/** Platform tables: no clinic context needed. */
const link = (expiresAt: Date) => ({ clinicId: "clinic_a", guardianId: "g_1", purpose: "invite" as const, createdAt: new Date(expiresAt.getTime() - 72 * 60 * 60_000), expiresAt });
const trailRow = (at: Date) => ({ at, operatorId: "op_1", operatorName: "Op", action: "update" as const, record: "Clinic account", detail: "Account paused" });

describe("retention prunes (B13c2a)", () => {
  it("deletes portal links 30 days past expiry, and keeps newer and live ones", async () => {
    await prisma.portalLink.createMany({ data: [link(daysAgo(KEEP_LINK_DAYS + 1)), link(daysAgo(KEEP_LINK_DAYS - 1)), link(daysAgo(-2))] });
    const portal = off.get(PortalService);
    expect(await portal.pruneLinks(NOW)).toBe(1);
    expect((await prisma.portalLink.findMany({ select: { expiresAt: true } })).map((l) => l.expiresAt.getTime()).sort()).toEqual(
      [daysAgo(KEEP_LINK_DAYS - 1), daysAgo(-2)].map((d) => d.getTime()).sort(),
    );
    await prisma.portalLink.createMany({ data: Array.from({ length: 2500 }, () => link(daysAgo(40))) });
    expect(await portal.pruneLinks(NOW)).toBe(2500); // the batching loop: 1,000 at a time until done
  });

  it("prunes no operator audit row while OPERATOR_AUDIT_KEEP_DAYS is unset", async () => {
    await prisma.operatorAuditEvent.createMany({ data: [trailRow(daysAgo(4000)), trailRow(daysAgo(400))] });
    await off.get(OperatorAuditJobs).prune();
    expect(await prisma.operatorAuditEvent.count()).toBe(2);
  });

  it("prunes only operator audit rows older than the period once it is set", async () => {
    await prisma.operatorAuditEvent.createMany({ data: [trailRow(daysAgo(400)), trailRow(daysAgo(300))] });
    expect(await year.get(OperatorAuditJobs).prune()).toBe("ran");
    const left = await prisma.operatorAuditEvent.findMany({ select: { at: true } });
    expect(left.map((r) => r.at.getTime())).toEqual([daysAgo(300).getTime()]);
  });

  it("still refuses a Prisma delete on the operator trail", async () => {
    await expect(prisma.operatorAuditEvent.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });
});
