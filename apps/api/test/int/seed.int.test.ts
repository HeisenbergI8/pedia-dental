import { findConflict, patientSearchText, planProgress } from "@pedia/shared";
import { DEMO_CLINIC_ID, DEMO_PASSWORD, OPERATORS, accountsByEmail, demoLogins, seedPlatform } from "@pedia/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { APPOINTMENT_COLUMNS, toAppointment } from "../../src/appointments/appointment.rows";
import { REQUEST_COLUMNS, toRequest } from "../../src/appointments/request.rows";
import { CHART_COLUMNS, toChartEntry } from "../../src/chart/chart.rows";
import { GROWTH_COLUMNS, toGrowth } from "../../src/growth/growth.rows";
import { NOTE_COLUMNS, toNote } from "../../src/notes/note.rows";
import { PLAN_COLUMNS, toPlanItem } from "../../src/plan/plan.rows";
import { DUE_COLUMNS, toDueItem } from "../../src/recalls/due-item.rows";
import { seedDatabase } from "../../src/seed/seed-database";
import { VISIT_COLUMNS, toVisit } from "../../src/visits/visit.rows";
import { inClinic, resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
const hasher = new Hasher();
const platform = seedPlatform();

beforeAll(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => prisma.onModuleDestroy());

describe("prisma db seed (seedDatabase) on MySQL", () => {
  it("writes every clinic account, and each clinic's branches and staff under its own clinicId", async () => {
    expect(await prisma.clinicAccount.count()).toBe(platform.accounts.length);
    for (const { id } of platform.accounts) {
      expect(await inClinic(id, () => prisma.branch.count())).toBe(platform.tenants[id]!.branches.length);
      expect(await inClinic(id, () => prisma.staff.count())).toBe(platform.tenants[id]!.staff.length);
    }
  });

  it("writes each clinic's chairs, procedures, note templates and message templates in the mock's order (B3)", async () => {
    const byPosition = { orderBy: { position: "asc" } } as const;
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        expect((await prisma.chair.findMany(byPosition)).map((c) => c.id)).toEqual(db.chairs.map((c) => c.id));
        expect((await prisma.procedure.findMany(byPosition)).map((p) => [p.code, p.fee])).toEqual(db.procedures.map((p) => [p.code, p.fee]));
        expect((await prisma.noteTemplate.findMany(byPosition)).map((t) => t.id)).toEqual(db.noteTemplates.map((t) => t.id));
        expect((await prisma.messageTemplate.findMany(byPosition)).map((t) => t.kind)).toEqual(db.messageTemplates.map((t) => t.kind));
      });
    }
  });

  it("writes each clinic's patients with their guardians, consents and privacy rows (B4)", async () => {
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        expect(await prisma.patient.count()).toBe(db.patients.length);
        expect(await prisma.patientGuardian.count()).toBe(db.patients.reduce((n, p) => n + p.guardians.length, 0));
        expect(await prisma.patientPrivacyConsent.count()).toBe(db.patients.filter((p) => p.privacyConsent).length);
        for (const p of db.patients.slice(0, 1)) {
          const row = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
          expect([row.patientNo, row.searchNames]).toEqual([p.patientNo, patientSearchText(p).names]);
        }
      });
    }
  });

  it("writes each clinic's visits and chart entries with the mock's ids, as the mock serves them (B5)", async () => {
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        const visits = (await prisma.visit.findMany({ select: VISIT_COLUMNS })).map(toVisit);
        const entries = (await prisma.chartEntry.findMany({ select: CHART_COLUMNS })).map(toChartEntry);
        expect(byId(visits)).toEqual(byId(db.visits.map((v) => ({ ...v, clinicId: id }))));
        expect(byId(entries)).toEqual(byId(db.chartEntries.map((e) => ({ ...e, clinicId: id }))));
      });
    }
    expect(platform.tenants[DEMO_CLINIC_ID]!.chartEntries.length).toBeGreaterThan(0); // not vacuous
  });

  it("writes each clinic's notes, growth records and plan items with the mock's ids, as the mock serves them (B6)", async () => {
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        const notes = (await prisma.clinicalNote.findMany({ select: NOTE_COLUMNS })).map(toNote);
        const growth = (await prisma.growthRecord.findMany({ select: GROWTH_COLUMNS })).map(toGrowth);
        const plan = (await prisma.planItem.findMany({ select: PLAN_COLUMNS })).map(toPlanItem);
        expect(byId(notes)).toEqual(byId(db.notes.map((n) => ({ ...n, clinicId: id }))));
        expect(byId(growth)).toEqual(byId(db.growth.map((g) => ({ ...g, clinicId: id }))));
        expect(byId(plan)).toEqual(byId(db.planItems.map((i) => ({ ...i, clinicId: id }))));
      });
    }
    const demo = platform.tenants[DEMO_CLINIC_ID]!; // not vacuous: the spec's example plan and the growth examples
    expect(planProgress(demo.planItems)).toEqual({ done: 3, total: 6 });
    expect(demo.growth.length).toBe(6);
  });

  it("writes each clinic's appointments, requests and due items with the mock's ids, with no double-booking (B7)", async () => {
    const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        const appointments = (await prisma.appointment.findMany({ select: APPOINTMENT_COLUMNS })).map(toAppointment);
        const requests = (await prisma.appointmentRequest.findMany({ select: REQUEST_COLUMNS })).map(toRequest);
        const due = await prisma.dueItem.findMany({ select: DUE_COLUMNS });
        expect(byId(appointments)).toEqual(byId(db.appointments.map((a) => ({ ...a, clinicId: id }))));
        expect(byId(requests)).toEqual(byId(db.appointmentRequests.map((q) => ({ ...q, clinicId: id }))));
        expect(byId(due.map((r) => toDueItem(r)))).toEqual(byId(db.dueItems.map((i) => ({ ...i, clinicId: id }))));
        const visitOf = new Map(db.notes.map((n) => [n.id, n.visitId]));
        for (const r of due) expect(r.visitId).toBe(visitOf.get(r.sourceNoteId));
        appointments.forEach((a, i) => expect(findConflict(a, appointments.slice(0, i))).toBeUndefined());
      });
    }
    expect(platform.tenants[DEMO_CLINIC_ID]!.appointments.length).toBeGreaterThan(0);
  });

  it("gives every mock login the same email in the same clinics, opened by the demo password", async () => {
    for (const { email } of demoLogins(platform)) {
      const rows = await prisma.credential.findMany({ where: { email }, select: { clinicId: true, passwordHash: true } });
      expect(rows.map((r) => r.clinicId).sort()).toEqual(accountsByEmail(platform, email).map((m) => m.clinicId).sort());
      expect(await hasher.matches(rows[0]!.passwordHash, DEMO_PASSWORD)).toBe(true);
    }
  });

  it("stores PINs only as hashes, and the operator outside every clinic", async () => {
    const withPin = await prisma.credential.findMany({ where: { pinHash: { not: null } }, select: { pinHash: true } });
    expect(withPin.length).toBeGreaterThan(0);
    expect(withPin.every((c) => c.pinHash!.startsWith("$argon2id$"))).toBe(true);
    expect((await prisma.operatorUser.findMany()).map((o) => o.email)).toEqual(OPERATORS.map((o) => o.email));
  });

  it("lists the login page's featured logins, one per email", async () => {
    const featured = await prisma.demoLogin.findMany({ where: { featured: true }, select: { email: true } });
    expect(new Set(featured.map((f) => f.email))).toEqual(new Set(demoLogins(platform).map((l) => l.email)));
  });

  it("refuses to run twice", async () => {
    await expect(seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform)).rejects.toThrow(/already exist/);
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM ClinicAccount`;
    expect(Number(row!.n)).toBe(platform.accounts.length);
  });
});
