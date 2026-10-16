import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { AcknowledgementPrompt, Patient, PatientView, PrivacyNoticeView, SessionUser, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web/src/mocks/privacy.test.ts (consents, choices, the notice), against the API. Cases share one seeded database, in order. */
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const own = childrenOf(db, parentGuardianId).find((p) => p.privacyConsent)!;
const another = db.patients.find((p) => p.privacyConsent && !p.guardians.some((g) => g.id === parentGuardianId))!;
const unconsented = db.patients.find((p) => !p.privacyConsent)!;

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post" | "put", path: string, cookie = "", body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};
const audits = (patientId: string | null, record: string) => inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { patientId, record } }));
const choices = (cookie: string, id: string, body: object) => call("post", `/patients/${id}/privacy-choices`, cookie, body);

describe("consent and choices", () => {
  it("records consent once for a child registered before chunk 24 (#18)", async () => {
    const cookie = await as(FRONT_DESK);
    const early = await choices(cookie, unconsented.id, { photos: false });
    expect([early.status, early.text]).toEqual([409, "Record the parent's consent first"]);
    const guardianId = unconsented.guardians.find((g) => g.isPrimary)!.id;
    const body = { guardianId, photos: true, reminders: true, confirmed: true };
    const stranger = await call("post", `/patients/${unconsented.id}/privacy-consent`, cookie, { ...body, guardianId: "g_stranger" });
    expect([stranger.status, stranger.text]).toEqual([400, "Choose one of this child's guardians"]);
    const recorded = await ok(call("post", `/patients/${unconsented.id}/privacy-consent`, cookie, body), Patient, 201);
    expect(recorded.privacyConsent).toMatchObject({ guardianId, recordedById: "staff_cruz", noticeVersion: 1 });
    expect(recorded.privacyChoices).toEqual([expect.objectContaining({ photos: true, reminders: true, by: "staff" })]);
    const again = await call("post", `/patients/${unconsented.id}/privacy-consent`, cookie, body);
    expect([again.status, again.text]).toEqual([409, "Consent is already recorded for this child. Change the optional consents instead."]);
    expect(await audits(unconsented.id, "Privacy consent")).toBe(1);
  });

  it("keeps every change, and lets the parent change their own child only", async () => {
    const before = own.privacyChoices?.length ?? 0;
    await ok(choices(await as(FRONT_DESK), own.id, { photos: false }), PatientView);
    const parent = await as(PARENT);
    const after = await ok(choices(parent, own.id, { reminders: false }), PatientView);
    expect(after.privacyChoices).toHaveLength(before + 2);
    expect(after.privacyChoices!.slice(0, before)).toEqual(own.privacyChoices ?? []);
    expect(after.privacyChoices!.slice(before)).toEqual([
      expect.objectContaining({ photos: false, by: "staff", byName: "Liza Cruz" }),
      expect.objectContaining({ photos: false, reminders: false, by: "parent" }),
    ]);
    const theirs = await choices(parent, another.id, { photos: false });
    expect([theirs.status, theirs.text]).toEqual([403, "This isn't one of your children's records"]);
    expect(await audits(own.id, "Privacy consent (changed)")).toBe(2);
  });

  it.todo("sends nothing once reminders are off (B9: messages)");

  it("merges a one-key change onto the record, so a stale screen can't re-grant a declined consent", async () => {
    const cookie = await as(DENTIST); // consents.manage
    await ok(choices(cookie, another.id, { photos: false }), PatientView);
    const after = await ok(choices(cookie, another.id, { reminders: true }), PatientView);
    expect(after.privacyChoices!.at(-1)).toMatchObject({ photos: false, reminders: true });
  });

  it.todo("withdraws reminders already queued when the family says no (B9: queued messages)");
});

describe("the clinic's privacy notice", () => {
  const notice = { body: "We keep your child's records safe.\n\nAsk us anything.", contactName: "Carmen Dela Cruz", contactEmail: "privacy@bulilit.ph" };

  it("lets a parent acknowledge version 1 first", async () => {
    const parent = await as(PARENT);
    expect((await ok(call("get", "/auth/me", parent), SessionUser)).mustAcknowledge).toBe("notice");
    await ok(call("post", "/auth/acknowledgement", parent, { kind: "notice", version: 1 }), z.unknown());
    expect((await ok(call("get", "/auth/me", parent), SessionUser)).mustAcknowledge).toBeUndefined();
  });

  it("serves version 1 to staff and the public, and only the Owner saves a new version", async () => {
    const v1 = await ok(call("get", "/clinic/privacy-notice", await as(FRONT_DESK)), PrivacyNoticeView);
    expect(v1.version).toBe(1);
    expect(v1.clinicName).toBe(platform.accounts.find((a) => a.id === DEMO_CLINIC_ID)!.name);
    expect((await call("put", "/clinic/privacy-notice", await as(DENTIST), notice)).status).toBe(403);
    expect((await call("put", "/clinic/privacy-notice", await as(OWNER), {})).status).toBe(400);
    const v2 = await ok(call("put", "/clinic/privacy-notice", await as(OWNER), notice), PrivacyNoticeView);
    expect(v2).toMatchObject({ version: 2, savedByName: "Dr. Paolo Villanueva", body: notice.body });
    expect(await audits(null, "Privacy notice")).toBe(1);
  });

  it("serves the notice in force before sign-in, and 404s an unknown clinic; Ngiti's stays its own", async () => {
    expect((await ok(call("get", `/legal/notices/${DEMO_CLINIC_ID}`), PrivacyNoticeView)).version).toBe(2);
    const none = await call("get", "/legal/notices/nope");
    expect([none.status, none.text]).toEqual([404, "We can't find that clinic's privacy notice"]);
    expect((await ok(call("get", "/legal/notices/clinic_ngiti"), PrivacyNoticeView)).version).toBe(1);
  });

  it("asks a parent to read the new version, lists their children, and keeps the old acknowledgement", async () => {
    const parent = await as(PARENT);
    expect((await ok(call("get", "/auth/me", parent), SessionUser)).mustAcknowledge).toBe("notice");
    const prompt = await ok(call("get", "/auth/acknowledgement", parent), AcknowledgementPrompt);
    expect(prompt.version).toBe(2);
    expect(prompt.children!.map((c) => c.firstName).sort()).toEqual(childrenOf(db, parentGuardianId).map((p) => p.firstName).sort());
    expect(prompt.children!.find((c) => c.firstName === own.firstName)).toMatchObject({ recorded: true, photos: false, reminders: false });
    await ok(call("post", "/auth/acknowledgement", parent, { kind: "notice", version: 2 }), z.unknown());
    expect((await ok(call("get", "/auth/me", parent), SessionUser)).mustAcknowledge).toBeUndefined();
    const versions = await inClinic(DEMO_CLINIC_ID, () =>
      prisma.acknowledgement.findMany({ where: { accountId: PARENT[1], kind: "notice" }, select: { version: true }, orderBy: { version: "asc" } }),
    );
    expect(versions.map((v) => v.version)).toEqual([1, 2]); // append-only: the version-1 row is still there
  });

  it("names the notice in force on a new registration", async () => {
    const body: RegisterPatientInput = {
      firstName: "Nova", lastName: "Reyes", birthDate: "2021-01-05", sex: "female",
      guardians: [{ id: "g_nova", fullName: "Ines Reyes", relationship: "Mother", phone: "09173334444", isPrimary: true }],
      allergies: [], medicalConditions: [], medications: [], alerts: [], dentalHistory: { previousClinic: "", notes: "" },
      privacyConsent: { guardianId: "g_nova", photos: true, reminders: true, confirmed: true },
    };
    const p = await ok(call("post", "/patients", await as(FRONT_DESK), body), Patient, 201);
    expect(p.privacyConsent!.noticeVersion).toBe(2);
    const earlier = await ok(call("get", `/patients/${unconsented.id}`, await as(FRONT_DESK)), Patient);
    expect(earlier.privacyConsent!.noticeVersion).toBe(1);
  });
});
