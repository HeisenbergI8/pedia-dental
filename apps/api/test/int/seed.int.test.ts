import { findConflict, patientSearchText, planProgress } from "@pedia/shared";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_CLINIC_ID, DEMO_PASSWORD, OPERATORS, SEED_FILES, accountsByLogin, demoLogins, seedPlatform, type SeedFileType } from "@pedia/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { APPOINTMENT_COLUMNS, toAppointment } from "../../src/appointments/appointment.rows";
import { REQUEST_COLUMNS, toRequest } from "../../src/appointments/request.rows";
import { INVOICE_COLUMNS, LINE_COLUMNS, PAYMENT_COLUMNS, PAYMENT_ORDER, receiptCounters, toInvoice, toPayment } from "../../src/billing-records/billing.rows";
import { CHART_COLUMNS, toChartEntry } from "../../src/chart/chart.rows";
import { GROWTH_COLUMNS, toGrowth } from "../../src/growth/growth.rows";
import { NOTE_COLUMNS, toNote } from "../../src/notes/note.rows";
import { PLAN_COLUMNS, toPlanItem } from "../../src/plan/plan.rows";
import { MESSAGE_COLUMNS, MESSAGE_SEND, toMessage } from "../../src/message-queue/message.rows";
import { DUE_COLUMNS, toDueItem } from "../../src/recalls/due-item.rows";
import { seedDatabase } from "../../src/seed/seed-database";
import { DOCUMENT_SELECT, toDocument } from "../../src/documents/document.rows";
import { PHOTO_SELECT, toPhoto } from "../../src/photos/photo.rows";
import { LocalDiskStorage } from "../../src/storage/local-disk.storage";
import { VISIT_COLUMNS, toVisit } from "../../src/visits/visit.rows";
import { toSignup, toSignupRow } from "../../src/signups/signup.rows";
import { parsePlatformKey } from "../../src/storage/storage";
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

  it("writes each clinic's bills, payments and receipt counters with the mock's ids and numbers (B8)", async () => {
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      await inClinic(id, async () => {
        const lines = await prisma.invoiceLine.findMany({ select: LINE_COLUMNS });
        const invoices = (await prisma.invoice.findMany({ select: INVOICE_COLUMNS })).map((r) => toInvoice(r, lines.filter((l) => l.invoiceId === r.id)));
        const payments = (await prisma.payment.findMany({ select: PAYMENT_COLUMNS, orderBy: PAYMENT_ORDER })).map(toPayment);
        const counters = await prisma.receiptCounter.findMany({ select: { series: true, last: true }, orderBy: { series: "asc" } });
        const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
        expect(byId(invoices)).toEqual(byId(db.invoices.map((i) => ({ ...i, clinicId: id }))));
        expect(byId(payments)).toEqual(byId(db.payments.map((p) => ({ ...p, clinicId: id }))));
        expect(counters).toEqual(receiptCounters(db.payments).sort((a, b) => a.series.localeCompare(b.series)));
      });
    }
    expect(platform.tenants[DEMO_CLINIC_ID]!.payments.length).toBeGreaterThan(0);
  });

  it("writes each clinic's message log with the mock's ids, an outbox row per queued text and a month for each sent one (B9)", async () => {
    for (const { id } of platform.accounts) {
      const db = platform.tenants[id]!;
      const queued = db.messages.filter((m) => m.status === "queued").map((m) => m.id).sort();
      await inClinic(id, async () => {
        const messages = (await prisma.message.findMany({ select: MESSAGE_COLUMNS })).map(toMessage);
        const byId = new Map(messages.map((m) => [m.id, m]));
        expect(byId).toEqual(new Map(db.messages.map((m) => [m.id, { ...m, clinicId: id }])));
        expect(messages.filter((m) => /\{\w+\}/.test(m.body)).map((m) => m.id)).toEqual([]); // every placeholder filled
        expect(await prisma.message.count({ where: { status: "sent", sentAt: null } })).toBe(0);
      });
      const outbox = await prisma.outboxMessage.findMany({ where: { clinicId: id, kind: MESSAGE_SEND }, select: { payload: true } });
      expect(outbox.map((o) => (o.payload as { messageId: string }).messageId).sort()).toEqual(queued);
    }
    expect(platform.tenants[DEMO_CLINIC_ID]!.messages.length).toBeGreaterThan(0);
  });

  it("writes each clinic's photos (with files) and documents with the mock's ids (B10)", async () => {
    const root = mkdtempSync(join(tmpdir(), "b10-seed-"));
    const files = new LocalDiskStorage(root, "s".repeat(32));
    await resetDatabase(prisma);
    await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform, files);
    const db = platform.tenants[DEMO_CLINIC_ID]!;
    await inClinic(DEMO_CLINIC_ID, async () => {
      const photos = await prisma.clinicalPhoto.findMany({ select: { ...PHOTO_SELECT, fileKey: true }, orderBy: { id: "asc" } });
      expect(photos.map(({ fileKey: _, ...p }) => toPhoto(p))).toEqual([...db.photos].sort((a, b) => a.id.localeCompare(b.id)));
      for (const p of photos) expect((await files.get(p.fileKey))?.equals(Buffer.from(SEED_FILES[p.contentType as SeedFileType]))).toBe(true);
      const documents = (await prisma.patientDocument.findMany({ select: DOCUMENT_SELECT })).map(toDocument);
      expect(new Map(documents.map((d) => [d.id, d]))).toEqual(new Map(db.documents.map((d) => [d.id, d])));
      const used = (await prisma.storedFile.aggregate({ _sum: { bytes: true } }))._sum.bytes;
      expect(used).toBe(db.photos.reduce((n, p) => n + SEED_FILES[p.contentType as SeedFileType].length, 0));
    });
    await inClinic("clinic_ngiti", async () => expect([await prisma.clinicalPhoto.count(), await prisma.patientDocument.count()]).toEqual([0, 0]));
    // Without a driver (most integration tests): the rows, and no stored files.
    await resetDatabase(prisma);
    await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform);
    expect(await inClinic(DEMO_CLINIC_ID, async () => [await prisma.clinicalPhoto.count(), await prisma.storedFile.count()])).toEqual([db.photos.length, 0]);
  });

  it("gives every seeded guardian an active portal account and one mobile sign-in, unique in the clinic (B11)", async () => {
    await resetDatabase(prisma);
    await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform);
    for (const { id: clinicId } of platform.accounts) {
      const db = platform.tenants[clinicId]!;
      const accounts = await inClinic(clinicId, () => prisma.portalAccount.findMany({ select: { guardianId: true, state: true } }));
      expect(accounts.map((a) => a.guardianId).sort()).toEqual(db.portalAccounts.map((a) => a.guardianId).sort());
      expect(accounts.every((a) => a.state === "active")).toBe(true);
      const phones = await prisma.credential.findMany({ where: { clinicId, guardianId: { not: null } }, select: { phone: true } });
      const numbers = phones.flatMap((p) => (p.phone ? [p.phone] : []));
      expect(numbers.length > 0).toBe(db.portalAccounts.length > 0); // a clinic with no patients has no parents
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it("writes Primolar's billing: prices, sign-ups, subscriptions with their invoices, the counter and the receipts (B12)", async () => {
    const root = mkdtempSync(join(tmpdir(), "b12-seed-"));
    const files = new LocalDiskStorage(root, "s".repeat(32));
    await resetDatabase(prisma);
    await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform, files);
    const settings = await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } });
    expect([settings.midMonthlyFee, settings.designAddOn, settings.paymentQrKey]).toEqual([platform.prices.plans.mid.monthlyFee, platform.prices.designAddOn, null]);
    // Compared as rows: the seed writes instants with +08:00, the database answers in UTC (the same moment).
    expect((await prisma.signup.findMany()).map((r) => toSignupRow(toSignup(r)))).toEqual(platform.signups.map(toSignupRow));
    expect(await prisma.subscription.count()).toBe(platform.subscriptions.length);
    const payments = platform.subscriptions.flatMap((s) => s.payments);
    expect(await prisma.subscriptionPayment.count()).toBe(payments.length);
    expect(await prisma.subscriptionLine.count()).toBe(payments.reduce((n, p) => n + p.lines.length, 0));
    expect((await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "primolar" } })).next).toBe(payments.length + 1);
    const receipts = await prisma.paymentReceipt.findMany();
    expect(receipts.map((r) => [r.id, r.status, r.clinicId])).toEqual(platform.receipts.map((r) => [r.id, r.status, r.payer.kind === "subscription" ? r.payer.clinicId : null]));
    for (const r of receipts) {
      expect(parsePlatformKey(r.fileKey!)?.area).toBe("receipts");
      expect((await files.get(r.fileKey!))?.equals(Buffer.from(SEED_FILES["image/png"]))).toBe(true);
    }
    // No ledger row for a platform file: every clinic's ledger is its photos, and nothing more.
    for (const { id } of platform.accounts) {
      expect(await inClinic(id, async () => [await prisma.storedFile.count(), await prisma.clinicalPhoto.count()]).then(([f, p]) => f === p)).toBe(true);
    }
  });

  it("gives every mock login the same email in the same clinics, opened by the demo password", async () => {
    for (const { email } of demoLogins(platform)) {
      const rows = await prisma.credential.findMany({ where: { email }, select: { clinicId: true, passwordHash: true } });
      expect(rows.map((r) => r.clinicId).sort()).toEqual(accountsByLogin(platform, email).map((m) => m.clinicId).sort());
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
