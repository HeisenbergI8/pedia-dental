import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { PrivacyRequest, PrivacyRequestPage, addWorkingDays } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { Clock } from "../../src/common/clock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/**
 * B13c2b: the privacy request register and restriction on erasure. Twins of apps/web/src/mocks/privacy.test.ts's
 * "privacy requests and erasure (B13c2b)" cases (identical titles, the port ledger). Cases share one database, in order.
 */
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;
let today: string;

type Login = readonly [clinicId: string, accountId: string];
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const child = db.patients[0]!;
const UPCOMING = ["booked", "confirmed", "arrived", "in_chair"];
const seededAt = new Date().toISOString();
// The child to restrict: guardians with no other child, one of them with an active portal login (so the portal case
// proves a session that worked before), no upcoming appointment and no pending request. Read from the seed.
const lone = db.patients.find((p) => p.guardians.every((g) => childrenOf(db, g.id).length === 1)
  && p.guardians.some((g) => db.portalAccounts.some((a) => a.guardianId === g.id && a.state === "active"))
  && !db.appointments.some((a) => a.patientId === p.id && a.startsAt >= seededAt && UPCOMING.includes(a.status))
  && !db.appointmentRequests.some((r) => r.patientId === p.id && r.status === "pending"))!;
const loneParent = lone.guardians.find((g) => db.portalAccounts.some((a) => a.guardianId === g.id && a.state === "active"))!;
let parentCookie: string;

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  today = app.get(Clock).today();
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
const logOne = async (who: Login, body: Record<string, unknown>) =>
  ok(call("post", "/privacy-requests", await as(who), { kind: "access", requesterName: "Maria Santos", relationship: "Mother", channel: "in_person", receivedOn: today, ...body }), PrivacyRequest, 201);

describe("privacy requests and erasure (B13c2b)", () => {
  it("logs a request with its deadline in working days, for the Owner and admins only", async () => {
    const r = await logOne(OWNER, { patientId: child.id });
    expect(r).toMatchObject({ status: "open", dueOn: addWorkingDays(today, 15), patientName: `${child.firstName} ${child.lastName}`, loggedByName: expect.any(String) });
    await logOne(ADMIN, { kind: "objection", requesterName: "A parent" }); // no child: a general objection
    for (const who of [FRONT_DESK, DENTIST]) expect((await call("post", "/privacy-requests", await as(who), {})).status).toBe(403);
    expect((await call("get", "/privacy-requests", await as(FRONT_DESK))).status).toBe(403);
    const audited = await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Privacy request", action: "create" } }));
    expect(audited).toBe(2);
  });

  it("refuses an erasure request without a child, and a day after today", async () => {
    const owner = await as(OWNER);
    expect((await call("post", "/privacy-requests", owner, { kind: "erasure", requesterName: "X", channel: "letter", receivedOn: today })).status).toBe(400);
    const tomorrow = addWorkingDays(today, 1);
    const late = await call("post", "/privacy-requests", owner, { kind: "access", requesterName: "X", channel: "letter", receivedOn: tomorrow });
    expect(late.status).toBe(409);
    expect(late.text).toBe("The day it was received can't be after today");
  });

  it("lists open requests soonest due first, with the child's name", async () => {
    await logOne(OWNER, { receivedOn: "2026-01-05", requesterName: "Earliest" }); // overdue on any later day
    const page = await ok(call("get", "/privacy-requests", await as(ADMIN)), PrivacyRequestPage);
    expect(page.requests[0]!.requesterName).toBe("Earliest");
    expect(page.requests.map((r) => r.dueOn)).toEqual([...page.requests.map((r) => r.dueOn)].sort());
    expect(page.requests.find((r) => r.patientId === child.id)?.patientName).toBe(`${child.firstName} ${child.lastName}`);
    expect(page.next).toBeUndefined();
  });

  it("closes a request once, with its outcome, and pages the closed ones newest first", async () => {
    const owner = await as(OWNER);
    const open = (await ok(call("get", "/privacy-requests", owner), PrivacyRequestPage)).requests;
    for (const r of open) await ok(call("post", `/privacy-requests/${r.id}/close`, owner, { status: "done", outcome: "Copy given in person" }), PrivacyRequest);
    const again = await call("post", `/privacy-requests/${open[0]!.id}/close`, owner, { status: "declined", outcome: "x" });
    expect(again.status).toBe(409);
    const first = await ok(call("get", "/privacy-requests?status=closed&limit=2", owner), PrivacyRequestPage);
    expect(first.requests).toHaveLength(2);
    expect(first.requests[0]!.closedAt! >= first.requests[1]!.closedAt!).toBe(true);
    const rest = await ok(call("get", `/privacy-requests?status=closed&limit=2&before=${encodeURIComponent(first.next!)}`, owner), PrivacyRequestPage);
    expect(rest.requests.map((r) => r.id)).not.toContain(first.requests[0]!.id);
    expect((await ok(call("get", "/privacy-requests", owner), PrivacyRequestPage)).requests).toEqual([]);
  });

  it("won't approve an erasure while the child has an upcoming appointment", async () => {
    const owner = await as(OWNER);
    const busy = db.appointments.find((a) => a.startsAt >= new Date().toISOString() && a.status === "booked")!;
    const r = await logOne(OWNER, { kind: "erasure", patientId: busy.patientId });
    const res = await call("post", `/privacy-requests/${r.id}/close`, owner, { status: "done", outcome: "Approved" });
    expect(res.status).toBe(409);
    expect(res.text).toMatch(/upcoming appointments first$/);
    const after = await inClinic(DEMO_CLINIC_ID, () => prisma.patient.findUniqueOrThrow({ where: { id: busy.patientId }, select: { restrictedAt: true } }));
    expect(after.restrictedAt).toBeNull();
    await ok(call("post", `/privacy-requests/${r.id}/close`, owner, { status: "declined", outcome: "Still in treatment" }), PrivacyRequest);
  });

  it("restricts the record when an erasure is approved: hidden from lists, refused to front desk, readable by the Owner", async () => {
    parentCookie = await as([DEMO_CLINIC_ID, `guardian.${loneParent.id}`]);
    expect((await call("get", "/auth/me", parentCookie)).status).toBe(200); // the parent's session works before
    const r = await logOne(OWNER, { kind: "erasure", patientId: lone.id });
    await ok(call("post", `/privacy-requests/${r.id}/close`, await as(ADMIN), { status: "done", outcome: "Restricted; anonymised when retention ends" }), PrivacyRequest);
    const desk = await as(FRONT_DESK);
    const refused = await call("get", `/patients/${lone.id}`, desk);
    expect(refused.status).toBe(403);
    expect(refused.text).toBe("This child's record is restricted after a privacy request. Ask the clinic's Owner.");
    const list = await call("get", `/patient-summaries?q=${encodeURIComponent(lone.firstName)}&page=1&pageSize=50`, desk);
    expect(list.status, list.text).toBe(200);
    expect(list.body.rows.map((x: { id: string }) => x.id)).not.toContain(lone.id);
    const owner = await call("get", `/patients/${lone.id}`, await as(OWNER));
    expect(owner.status).toBe(200);
    expect(owner.body.restrictedAt).toEqual(expect.any(String));
    const denied = await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { patientId: lone.id, record: "Patient record (restricted)", action: "denied" } }));
    expect(denied).toBe(1);
  });

  it("turns photos and reminders off and takes the child out of the parent's portal", async () => {
    const owner = await call("get", `/patients/${lone.id}`, await as(OWNER));
    expect(owner.body.privacyChoices.at(-1)).toMatchObject({ photos: false, reminders: false, by: "staff" });
    const queued = await inClinic(DEMO_CLINIC_ID, () => prisma.message.count({ where: { patientId: lone.id, status: "queued" } }));
    expect(queued).toBe(0);
    expect((await call("get", "/auth/me", parentCookie)).status).toBe(401); // no child left: the open session is closed
  });
});
