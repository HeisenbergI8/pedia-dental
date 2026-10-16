import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../src/common/clock";
import { requestContext } from "../../src/common/request-context";
import { Hasher } from "../../src/auth/hashing";
import { IdentityService } from "../../src/auth/identity.service";
import { SessionService } from "../../src/auth/session.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
const clock = new FixedClock(new Date("2026-10-16T00:00:00Z"));
const hasher = new Hasher();
const sessions = new SessionService(prisma, clock);
const identity = new IdentityService(prisma, clock, hasher);
const minutes = (n: number) => clock.set(new Date(clock.now().getTime() + n * 60_000));
const asClinic = <T>(clinicId: string, fn: () => Promise<T>) =>
  requestContext.run({ requestId: "int", clinicId, operator: false }, async () => await fn());

beforeAll(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
beforeEach(async () => {
  await prisma.session.deleteMany();
  await prisma.operatorSession.deleteMany();
  clock.set(new Date("2026-10-16T00:00:00Z"));
});
afterAll(() => prisma.onModuleDestroy());

describe("clinic sessions on MySQL", () => {
  it("stores only the token's hash", async () => {
    const token = await sessions.openClinic(DEMO_CLINIC_ID, "staff_reyes");
    expect(await prisma.session.findFirst({ where: { tokenHash: token } })).toBeNull();
    expect(await sessions.resolveClinic(token)).toMatchObject({ clinicId: DEMO_CLINIC_ID, accountId: "staff_reyes" });
  });

  it("stays open while used every 29 minutes, ends after 30 idle, and the row is gone", async () => {
    const token = await sessions.openClinic(DEMO_CLINIC_ID, "staff_reyes");
    for (let i = 0; i < 3; i++) {
      minutes(29);
      expect(await sessions.resolveClinic(token)).toBeDefined();
    }
    minutes(30);
    expect(await sessions.resolveClinic(token)).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("ends 8 hours after sign-in however active", async () => {
    const token = await sessions.openClinic(DEMO_CLINIC_ID, "staff_reyes");
    for (let i = 0; i < 16; i++) {
      minutes(29);
      await sessions.resolveClinic(token);
    }
    minutes(16); // 480 minutes
    expect(await sessions.resolveClinic(token)).toBeUndefined();
  });

  it("never resolves an operator token as a clinic session, or the reverse", async () => {
    const op = await sessions.openOperator("operator_primolar");
    const clinic = await sessions.openClinic(DEMO_CLINIC_ID, "staff_reyes");
    expect(await sessions.resolveClinic(op)).toBeUndefined();
    expect(await sessions.resolveOperator(clinic)).toBeUndefined();
    expect(await sessions.resolveOperator(op)).toMatchObject({ operatorId: "operator_primolar" });
  });
});

describe("identity behind a session", () => {
  it("refuses a suspended clinic's staff, and keeps its parents read-only", async () => {
    const parent = await prisma.credential.findFirstOrThrow({ where: { clinicId: DEMO_CLINIC_ID, guardianId: { not: null } } });
    await prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "suspended" } });
    try {
      expect(await asClinic(DEMO_CLINIC_ID, () => identity.forSession({ clinicId: DEMO_CLINIC_ID, accountId: "staff_reyes" }))).toBeUndefined();
      expect(await asClinic(DEMO_CLINIC_ID, () => identity.forSession(parent))).toMatchObject({ readOnly: true, user: { roles: ["parent"] } });
    } finally {
      await prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "active" } });
    }
  });

  it("ignores a pd_branch naming another clinic's branch, or one the login doesn't work at", async () => {
    const who = (await asClinic(DEMO_CLINIC_ID, () => identity.forSession({ clinicId: DEMO_CLINIC_ID, accountId: "staff_reyes" })))!;
    const other = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Branch WHERE clinicId <> ${DEMO_CLINIC_ID} LIMIT 1`;
    expect(identity.branchFor(who, other[0]!.id)?.id).toBe(who.branches[0]!.id);
    expect(identity.branchFor(who, "made_up")?.id).toBe(who.branches[0]!.id);
  });
});

describe("PIN lockout on MySQL", () => {
  it("counts two parallel wrong PINs, locks at five, then refuses even the right PIN", async () => {
    await prisma.credential.updateMany({ where: { clinicId: DEMO_CLINIC_ID, accountId: "staff_cruz" }, data: { pinHash: await hasher.hash("4321"), pinFailedAt: [] } });
    await Promise.all([1, 2].map(() => identity.checkPin(DEMO_CLINIC_ID, "staff_cruz", "0000")));
    const row = await prisma.credential.findFirstOrThrow({ where: { clinicId: DEMO_CLINIC_ID, accountId: "staff_cruz" } });
    expect(row.pinFailedAt).toHaveLength(2);
    for (let i = 0; i < 3; i++) await identity.checkPin(DEMO_CLINIC_ID, "staff_cruz", "0000");
    expect((await identity.checkPin(DEMO_CLINIC_ID, "staff_cruz", "4321"))?.outcome).toBe("locked");
    minutes(6);
    expect((await identity.checkPin(DEMO_CLINIC_ID, "staff_cruz", "4321"))?.outcome).toBe("ok");
  });
});
