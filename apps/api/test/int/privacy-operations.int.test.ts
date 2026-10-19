import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { type AuditAction, AuditLogPage, RecordsCopy } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/**
 * B13c2a: the copy of records and the audit-log reader. Twins of apps/web/src/mocks/privacy.test.ts's
 * "copy of records and the audit log (B13c2a)" cases (identical titles, the port ledger). Cases share one database, in order.
 */
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const own = childrenOf(db, parentGuardianId).find((p) => p.privacyConsent)!;
const another = db.patients.find((p) => !p.guardians.some((g) => g.id === parentGuardianId))!;

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post", path: string, cookie = "", body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};
const audits = (patientId: string | null, record: string, action: AuditAction) =>
  inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { patientId, record, action } }));

describe("copy of records (B13c2a)", () => {
  it("gives staff a copy of the child's whole record, signed notes only, audited as an export", async () => {
    const child = db.patients.find((p) => db.notes.some((n) => n.patientId === p.id && n.signedAt))!;
    const copy = await ok(call("post", `/patients/${child.id}/exports`, await as(OWNER)), RecordsCopy);
    expect(copy).toMatchObject({ kind: "primolar.records-copy", version: 1, omitted: [], patient: { id: child.id }, clinic: { id: DEMO_CLINIC_ID } });
    expect(copy.notes!.every((n) => n.signedAt)).toBe(true);
    expect(copy.visits!.length).toBeGreaterThan(0);
    expect(await audits(child.id, "Copy of records", "export")).toBe(1);
  });

  it("leaves guardian contacts and the message log out of a dentist's copy", async () => {
    const copy = await ok(call("post", `/patients/${own.id}/exports`, await as(DENTIST)), RecordsCopy);
    expect(copy.omitted).toEqual(["messages"]);
    expect(copy.patient.guardians.every((g) => g.phone === undefined)).toBe(true);
  });

  it("gives a parent their own child's copy without clinical sections, and refuses another family's", async () => {
    const cookie = await as(PARENT);
    const copy = await ok(call("post", `/patients/${own.id}/exports`, cookie), RecordsCopy);
    expect(copy.omitted).toEqual(["visits", "chart", "notes", "growth", "documents"]);
    expect(copy.photos!.every((p) => p.uploadedBy === "parent")).toBe(true);
    const theirs = await call("post", `/patients/${another.id}/exports`, cookie);
    expect([theirs.status, theirs.text]).toEqual([403, "This isn't one of your children's records"]);
  });

  // API only: the paused clinic (decision #44) needs the operator; MSW proves the same rule in its gate.
  it("lets a paused clinic's parent download their copy", async () => {
    await inClinic(DEMO_CLINIC_ID, () => prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "suspended" } }));
    try {
      expect((await call("post", `/patients/${own.id}/exports`, await as(PARENT))).status).toBe(200);
    } finally {
      await inClinic(DEMO_CLINIC_ID, () => prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "active" } }));
    }
  });
});

describe("the audit-log reader (B13c2a)", () => {
  it("lists the clinic's audit trail newest first, a page at a time, filtered by action and person, naming the child", async () => {
    const cookie = await as(OWNER);
    await call("get", `/patients/${own.id}`, await as(FRONT_DESK)); // a "Patient profile" view by front desk
    const first = await ok(call("get", "/audit-log?limit=2", cookie), AuditLogPage);
    expect(first.entries).toHaveLength(2);
    expect(first.entries.every((e) => e.clinicId === DEMO_CLINIC_ID)).toBe(true);
    expect(Date.parse(first.entries[0]!.at)).toBeGreaterThanOrEqual(Date.parse(first.entries[1]!.at));
    const second = await ok(call("get", `/audit-log?limit=2&before=${encodeURIComponent(first.next!)}`, cookie), AuditLogPage);
    expect(second.entries.map((e) => e.id)).not.toContain(first.entries[0]!.id);
    const views = await ok(call("get", `/audit-log?action=view&actorId=staff_cruz`, cookie), AuditLogPage);
    expect(views.entries.length).toBeGreaterThan(0);
    expect(views.entries.every((e) => e.action === "view" && e.actorId === "staff_cruz")).toBe(true);
    expect(views.entries.find((e) => e.patientId === own.id)!.patientName).toBe(`${own.firstName} ${own.lastName}`);
    expect((await call("get", "/audit-log?before=nonsense", cookie)).status).toBe(400);
  });

  it("shows the audit trail only to the Owner and admins, and logs that it was read", async () => {
    for (const login of [FRONT_DESK, DENTIST, PARENT]) expect((await call("get", "/audit-log", await as(login))).status).toBe(403);
    expect((await call("get", "/audit-log", await as(ADMIN))).status).toBe(200);
    expect(await audits(null, "Audit log", "view")).toBeGreaterThan(0);
  });
});
