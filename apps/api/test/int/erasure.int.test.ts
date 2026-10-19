import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { ANONYMISED, PatientView, RECORD_RETENTION } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { Clock } from "../../src/common/clock";
import { requestContext } from "../../src/common/request-context";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { ErasureService, NOT_RESTRICTED } from "../../src/privacy/erasure.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { DELETE_FILE } from "../../src/storage/delete-file.handler";
import { FileStorage } from "../../src/storage/storage";
import { StorageService } from "../../src/storage/storage.service";
import { VisitDaysService } from "../../src/visits/visit-days.service";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/**
 * B13c2b-2: anonymising a restricted child's record. API-only (a job, no route), so no web twin and no ledger line.
 * Cases share one database, in order.
 */
let app: INestApplication;
let prisma: PrismaService;
let erasure: ErasureService;
let child: string; // the demo clinic's first child with a clinical photo: it has photos, notes, messages and documents in the seed
let keys: string[] = [];
const before: Record<string, number> = {};
const at = <T>(fn: () => Promise<T>) => inClinic(DEMO_CLINIC_ID, fn);

const keptCounts = (patientId: string) =>
  at(async () => ({
    Invoice: await prisma.invoice.count({ where: { patientId } }),
    Payment: await prisma.payment.count({ where: { patientId } }),
    AuditEvent: await prisma.auditEvent.count({ where: { patientId } }),
    Visit: await prisma.visit.count({ where: { patientId } }),
    ChartEntry: await prisma.chartEntry.count({ where: { patientId } }),
    PrivacyRequest: await prisma.privacyRequest.count({ where: { patientId } }),
  }));
const fileDeletes = () => prisma.outboxMessage.count({ where: { clinicId: DEMO_CLINIC_ID, kind: DELETE_FILE } });

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  erasure = app.get(ErasureService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform(), app.get(FileStorage));
  child = await at(async () => (await prisma.clinicalPhoto.findFirstOrThrow({ select: { patientId: true }, orderBy: { id: "asc" } })).patientId);
}, 60_000);
afterAll(() => app.close());

describe("anonymisation (B13c2b-2)", () => {
  it("refuses a record that isn't restricted", async () => {
    await expect(at(() => erasure.anonymise(child))).rejects.toThrow(NOT_RESTRICTED);
    expect((await at(() => prisma.patient.findUniqueOrThrow({ where: { id: child } }))).anonymisedAt).toBeNull();
  });

  it("de-identifies a restricted child's record and queues the deletion of its files", async () => {
    await at(() => prisma.patient.update({ where: { id: child }, data: { restrictedAt: new Date() } }));
    Object.assign(before, await keptCounts(child));
    const original = await at(() => prisma.patient.findUniqueOrThrow({ where: { id: child } }));
    const photos = await at(() => prisma.clinicalPhoto.findMany({ where: { patientId: child }, select: { fileKey: true } }));
    keys = [...new Set([...photos.map((p) => p.fileKey), ...(original.photoRef ? [original.photoRef] : [])])];
    expect(keys.length).toBeGreaterThan(0);
    const queuedBefore = await fileDeletes();

    expect(await at(() => erasure.anonymise(child))).toBe(true);

    const p = await at(() => prisma.patient.findUniqueOrThrow({ where: { id: child } }));
    expect(p).toMatchObject({ firstName: ANONYMISED, lastName: original.patientNo, nickname: null, address: null, emergencyName: null, emergencyPhone: null, photoRef: null, searchNames: "" });
    expect(p.birthDate.toISOString().slice(0, 10)).toBe(`${original.birthDate.toISOString().slice(0, 4)}-01-01`);
    expect(p.restrictedAt).not.toBeNull();
    expect(p.anonymisedAt).not.toBeNull();
    await at(async () => {
      const guardians = await prisma.patientGuardian.findMany({ where: { patientId: child } });
      expect(guardians.length).toBeGreaterThan(0);
      expect(guardians.every((g) => g.fullName === ANONYMISED && g.phone === ANONYMISED && g.email === null)).toBe(true);
      expect((await prisma.message.findMany({ where: { patientId: child } })).every((m) => m.body === "" && m.to === "" && m.recipientName === ANONYMISED)).toBe(true);
      expect((await prisma.clinicalPhoto.findMany({ where: { patientId: child } })).every((r) => r.caption === "")).toBe(true);
      expect((await prisma.patientDocument.findMany({ where: { patientId: child } })).every((d) => d.title === ANONYMISED && d.details === null)).toBe(true);
      expect((await prisma.chartEntry.findMany({ where: { patientId: child } })).every((c) => c.note === null)).toBe(true);
      expect((await prisma.clinicalNote.findMany({ where: { patientId: child } })).every((n) => JSON.stringify(n.values) === "{}")).toBe(true);
      const consent = await prisma.patientPrivacyConsent.findFirst({ where: { patientId: child } });
      if (consent) expect(consent.guardianName).toBe(ANONYMISED);
    });
    expect(await fileDeletes()).toBe(queuedBefore + keys.length);
    for (const key of keys) {
      expect(await prisma.outboxMessage.count({ where: { clinicId: DEMO_CLINIC_ID, kind: DELETE_FILE, status: "pending", payload: { equals: { key } } } }), key).toBe(1);
    }
  });

  it("keeps money, visits, the chart and the audit trail", async () => {
    expect(await keptCounts(child)).toEqual(before);
  });

  it("deletes the files once the outbox runs", async () => {
    await app.get(OutboxWorker).drain();
    expect(await at(() => prisma.storedFile.count({ where: { key: { in: keys } } }))).toBe(0);
    const storage = app.get(StorageService);
    for (const key of keys) expect(await at(() => storage.get(key)), key).toBeUndefined();
  });

  it("does nothing the second time", async () => {
    const { anonymisedAt } = await at(() => prisma.patient.findUniqueOrThrow({ where: { id: child } }));
    const outbox = await prisma.outboxMessage.count();
    expect(await at(() => erasure.anonymise(child))).toBe(false);
    expect(await prisma.outboxMessage.count()).toBe(outbox);
    expect((await at(() => prisma.patient.findUniqueOrThrow({ where: { id: child } }))).anonymisedAt).toEqual(anonymisedAt);
  });

  it("lets the Owner still open the anonymised record", async () => {
    const cookie = `pd_session=${await app.get(SessionService).openClinic(DEMO_CLINIC_ID, "staff_villanueva")}`;
    const get = (path: string) => request(app.getHttpServer()).get(`/api${path}`).set("Cookie", cookie);
    const patient = await get(`/patients/${child}`);
    expect(patient.status, patient.text).toBe(200);
    expect(PatientView.parse(patient.body).firstName).toBe(ANONYMISED);
    for (const path of ["notes", "photos", "documents"]) {
      const r = await get(`/patients/${child}/${path}`);
      expect(r.status, `${path}: ${r.text}`).toBe(200);
    }
  });

  it("anonymises nothing while the periods are unconfirmed, and only children whose retention has ended", async () => {
    const today = app.get(Clock).today();
    const second = await at(async () => {
      const others = await prisma.patient.findMany({ where: { id: { not: child }, restrictedAt: null }, select: { id: true, createdAt: true }, orderBy: { id: "asc" } });
      const last = await app.get(VisitDaysService).lastVisitOn(others.map((o) => o.id));
      const upcoming = new Set((await prisma.appointment.findMany({ where: { startsAt: { gte: new Date() } }, select: { patientId: true } })).map((a) => a.patientId));
      return others.find((o) => !upcoming.has(o.id) && (last.get(o.id) ?? o.createdAt.toISOString().slice(0, 10)) < today)!.id;
    });
    await at(() => prisma.patient.update({ where: { id: second }, data: { restrictedAt: new Date() } }));
    await requestContext.run({ requestId: "t", operator: false }, async () => {
      expect(await erasure.anonymiseDue(RECORD_RETENTION)).toBe(0);
      expect(await erasure.anonymiseDue({ yearsAfterLastVisit: 200, untilAge: 0 })).toBe(0);
      expect(await erasure.anonymiseDue({ yearsAfterLastVisit: 0, untilAge: 0 }, 1)).toBe(1);
    });
    expect((await at(() => prisma.patient.findUniqueOrThrow({ where: { id: second } }))).anonymisedAt).not.toBeNull();
  });

  it("still refuses a Prisma update of the append-only tables", async () => {
    await expect(at(() => prisma.clinicalPhoto.updateMany({ data: { caption: "x" } }))).rejects.toThrow(/append-only/);
    await expect(at(() => prisma.patientDocument.updateMany({ data: { title: "x" } }))).rejects.toThrow(/append-only/);
    await expect(at(() => prisma.patientPrivacyConsent.updateMany({ data: { guardianName: "x" } }))).rejects.toThrow(/append-only/);
  });
});
