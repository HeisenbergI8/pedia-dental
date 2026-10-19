import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { LEGAL_DOCUMENTS, Patient, PatientView, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web's patient handler tests (writes), against the API (CHUNKS B4 done-when). Cases share one seeded database. */
const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post" | "put" | "patch", path: string, cookie: string, body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};

/** The mock tests' fixture (apps/web/src/mocks/handlers.test.ts). */
const newPatient: RegisterPatientInput = {
  firstName: "Bea",
  lastName: "Mendoza",
  birthDate: "2020-07-02",
  sex: "female",
  address: "",
  guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
  emergencyContact: { name: "", phone: "" },
  allergies: ["Latex"],
  medicalConditions: [],
  medications: [],
  alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
  privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
};
const withContacts = {
  ...newPatient,
  address: "12 Mabini St, Quezon City",
  emergencyContact: { name: "Lola Mendoza", phone: "09180001111" },
  guardians: [{ ...newPatient.guardians[0]!, email: "rosa@example.com" }],
};
const { privacyConsent: _consent, ...editable } = newPatient;
const register = async (cookie: string, body: unknown = newPatient) => ok(call("post", "/patients", cookie, body), Patient, 201);
const patientCount = () => inClinic(DEMO_CLINIC_ID, () => prisma.patient.count());
const auditFor = (patientId: string) =>
  inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.findMany({ where: { patientId }, select: { action: true, record: true }, orderBy: { at: "asc" } }));

describe("register (POST /patients)", () => {
  it("creates a patient that can be read back", async () => {
    const cookie = await as(ADMIN);
    const created = await register(cookie);
    expect(created.consents).toEqual([]);
    expect(await ok(call("get", `/patients/${created.id}`, cookie), Patient)).toEqual(created);
  });

  it("refuses a child without the consent (done-when), saving nothing", async () => {
    const cookie = await as(FRONT_DESK);
    const before = await patientCount();
    for (const body of [
      editable,
      { ...newPatient, privacyConsent: { ...newPatient.privacyConsent, confirmed: false } },
      { ...newPatient, privacyConsent: { ...newPatient.privacyConsent, guardianId: "g_stranger" } },
    ]) {
      const res = await call("post", "/patients", cookie, body);
      expect(res.status, res.text).toBe(400);
      expect(Array.isArray(res.body)).toBe(true); // Zod issues
    }
    expect(await patientCount()).toBe(before);
  });

  it("records who, when and which versions", async () => {
    const cookie = await as(FRONT_DESK);
    const created = await register(cookie, { ...newPatient, privacyConsent: { ...newPatient.privacyConsent, photos: false } });
    const notice = await inClinic(DEMO_CLINIC_ID, () => prisma.privacyNotice.findFirstOrThrow({ orderBy: { version: "desc" } }));
    expect(created.privacyConsent).toMatchObject({
      guardianId: "g_mother", guardianName: "Rosa Mendoza", relationship: "Mother",
      recordedById: "staff_cruz", recordedByName: "Liza Cruz", noticeVersion: notice.version, formVersion: LEGAL_DOCUMENTS.consent.version,
    });
    expect(created.privacyChoices).toEqual([expect.objectContaining({ photos: false, reminders: true, by: "staff" })]);
  });

  it("records the medical answers, and refuses an answer that contradicts the lists", async () => {
    const cookie = await as(ADMIN);
    expect((await call("post", "/patients", cookie, { ...newPatient, noKnownAllergies: true })).status).toBe(400);
    const created = await register(cookie, { ...newPatient, noKnownAllergies: false, noKnownConditions: true });
    expect(created).toMatchObject({ noKnownAllergies: false, noKnownConditions: true });
  });

  it("rejects a patient without exactly one primary guardian", async () => {
    const noPrimary = { ...newPatient, guardians: [{ ...newPatient.guardians[0]!, isPrimary: false }] };
    expect((await call("post", "/patients", await as(ADMIN), noPrimary)).status).toBe(400);
  });

  it("numbers new patients and tidies all-lower names; PUT never renumbers", async () => {
    const cookie = await as(ADMIN);
    const a = await register(cookie, { ...newPatient, firstName: "juan", lastName: "dela cruz" });
    const b = await register(cookie);
    expect([a.firstName, a.lastName]).toEqual(["Juan", "Dela Cruz"]);
    expect(Number(b.patientNo.slice(3))).toBe(Number(a.patientNo.slice(3)) + 1);
    const edited = await ok(call("put", `/patients/${a.id}`, cookie, { ...editable, nickname: "Jun" }), Patient);
    expect(edited.patientNo).toBe(a.patientNo);
  });

  it("gives 20 parallel registrations 20 distinct, consecutive numbers (the clinic's lock)", async () => {
    const cookie = await as(FRONT_DESK);
    for (let round = 0; round < 3; round++) {
      const res = await Promise.all(Array.from({ length: 20 }, () => call("post", "/patients", cookie, newPatient)));
      expect(res.map((r) => r.status)).toEqual(Array(20).fill(201));
      const numbers = res.map((r) => Number((r.body as Patient).patientNo.slice(3))).sort((x, y) => x - y);
      expect(numbers).toEqual(numbers.map((_, i) => numbers[0]! + i));
    }
  });
});

describe("edit (PUT, PATCH) and consents", () => {
  it("updates the profile but keeps consents, and won't drop a guardian who consented", async () => {
    const cookie = await as(ADMIN);
    const created = await register(cookie);
    const consented = await ok(call("post", `/patients/${created.id}/consents`, cookie, { guardianId: "g_mother", scope: "extraction", date: "2026-10-02" }), Patient, 201);
    expect(consented.consents).toHaveLength(1);
    const updated = await ok(call("put", `/patients/${created.id}`, cookie, { ...editable, allergies: [] }), Patient);
    expect([updated.allergies, updated.consents.length]).toEqual([[], 1]);
    const father = { id: "g_father", fullName: "Jun Mendoza", relationship: "Father", phone: "09181234567", isPrimary: true };
    const res = await call("put", `/patients/${created.id}`, cookie, { ...editable, guardians: [father] });
    expect([res.status, res.text]).toEqual([409, "A guardian who signed a consent can't be removed"]);
  });

  it("won't drop the guardian who gave the privacy consent", async () => {
    const cookie = await as(ADMIN);
    const created = await register(cookie);
    const father = { id: "g_father", fullName: "Jun Mendoza", relationship: "Father", phone: "09181234567", isPrimary: true };
    const res = await call("put", `/patients/${created.id}`, cookie, { ...editable, guardians: [father] });
    expect([res.status, res.text]).toEqual([409, "A guardian who signed a consent can't be removed"]);
  });

  it("rejects a consent from someone who isn't this child's guardian", async () => {
    const cookie = await as(ADMIN);
    const created = await register(cookie);
    const res = await call("post", `/patients/${created.id}/consents`, cookie, { guardianId: "g_stranger", scope: "extraction", date: "2026-10-02" });
    expect([res.status, res.text]).toEqual([400, "Guardian does not belong to this patient"]);
  });

  it("quick-updates phone, nickname, tags and alerts, and the phone follows the guardian to siblings and their search", async () => {
    const cookie = await as(ADMIN);
    const g = { ...newPatient.guardians[0]!, id: "g_quick", phone: "09171112222" };
    const consent = { ...newPatient.privacyConsent, guardianId: g.id };
    const older = await register(cookie, { ...newPatient, guardians: [g], privacyConsent: consent });
    const younger = await register(cookie, { ...newPatient, firstName: "Mia", guardians: [g], privacyConsent: consent });
    const input = { phone: "09998887777", nickname: "Bebe", tags: ["Anxious"], alerts: ["Strong gag reflex"] };
    const updated = await ok(call("patch", `/patients/${older.id}`, cookie, input), Patient);
    expect(updated).toMatchObject({ nickname: "Bebe", tags: ["Anxious"], alerts: ["Strong gag reflex"] });
    expect((await ok(call("get", `/patients/${younger.id}`, cookie), Patient)).guardians[0]!.phone).toBe("09998887777");
    const found = (q: string) => ok(call("get", `/patients?q=${q}`, cookie), z.array(PatientView));
    expect((await found("8887777")).map((p) => p.id)).toContain(younger.id);
    expect((await found("1112222")).map((p) => p.id)).not.toContain(younger.id);
  });

  it("lets a dentist quick-update everything but the phone", async () => {
    const p = await register(await as(ADMIN));
    const dentist = await as(DENTIST);
    expect((await ok(call("patch", `/patients/${p.id}`, dentist, { nickname: "Bebe", tags: [], alerts: [] }), PatientView)).nickname).toBe("Bebe");
    const res = await call("patch", `/patients/${p.id}`, dentist, { phone: "09998887777", tags: [], alerts: [] });
    expect([res.status, res.text]).toEqual([403, "Only front desk and admin can change contact details"]);
  });

  it("refuses a computed label or a repeated tag", async () => {
    const cookie = await as(ADMIN);
    const p = await register(cookie);
    const base = { phone: "09171234567", tags: [], alerts: [] };
    const label = await call("patch", `/patients/${p.id}`, cookie, { ...base, tags: ["Balance due"] });
    expect([label.status, label.text]).toEqual([400, `"Balance due" is worked out from the record, so it can't be a tag`]);
    expect((await call("patch", `/patients/${p.id}`, cookie, { ...base, tags: ["HMO", "hmo"] })).status).toBe(400);
  });

  it("answers 404 before looking at the body", async () => {
    const cookie = await as(ADMIN);
    for (const [method, path] of [["put", "/patients/nobody"], ["patch", "/patients/nobody"], ["post", "/patients/nobody/consents"]] as const) {
      const res = await call(method, path, cookie, {});
      expect([res.status, res.text], `${method} ${path}`).toEqual([404, "Patient not found"]);
    }
  });
});

describe("contacts", () => {
  it("sends a dentist no guardian phone, email, emergency contact or address from any write", async () => {
    const p = await register(await as(ADMIN), withContacts);
    const dentist = await as(DENTIST);
    const responses = [
      (await call("patch", `/patients/${p.id}`, dentist, { nickname: "Bebe", tags: [], alerts: [] })).text,
      (await call("post", `/patients/${p.id}/consents`, dentist, { guardianId: "g_mother", scope: "radiographs", date: "2026-10-04" })).text,
      (await call("post", "/patients", dentist, withContacts)).text, // even what they just typed
    ];
    expect(responses.join("\n")).not.toMatch(/0917|0918|Mabini|example\.com|Lola/);
    expect(await ok(call("get", `/patients/${p.id}`, await as(FRONT_DESK)), Patient)).toMatchObject({
      address: withContacts.address, emergencyContact: withContacts.emergencyContact,
    });
  });

  it("keeps the stored contacts when a dentist saves a profile they were sent without them", async () => {
    const p = await register(await as(ADMIN), withContacts);
    const dentist = await as(DENTIST);
    const seen = await ok(call("get", `/patients/${p.id}`, dentist), PatientView);
    await ok(call("put", `/patients/${p.id}`, dentist, { ...seen, allergies: ["Latex", "Penicillin"] }), PatientView);
    const forged = { ...seen, allergies: ["Latex", "Penicillin"], address: "Elsewhere", guardians: seen.guardians.map((g) => ({ ...g, phone: "09990000000" })) };
    await ok(call("put", `/patients/${p.id}`, dentist, forged), PatientView);
    const uncle = { id: "g_uncle", fullName: "Tito Mendoza", relationship: "Uncle", isPrimary: false };
    const res = await call("put", `/patients/${p.id}`, dentist, { ...seen, guardians: [...seen.guardians, uncle] });
    expect([res.status, res.text]).toEqual([403, "Only front desk and admin can add a guardian"]);
    const after = await ok(call("get", `/patients/${p.id}`, await as(FRONT_DESK)), Patient);
    expect(after.allergies).toEqual(["Latex", "Penicillin"]);
    expect(after).toMatchObject({ address: withContacts.address, emergencyContact: withContacts.emergencyContact });
    expect(after.guardians).toEqual([expect.objectContaining({ phone: "09171234567", email: "rosa@example.com" })]);
  });
});

describe("audit and tenancy", () => {
  it("records the profile and the privacy consent on register, an update on PUT and PATCH, and nothing for a refused POST", async () => {
    const cookie = await as(FRONT_DESK);
    const p = await register(cookie);
    await ok(call("put", `/patients/${p.id}`, cookie, { ...editable, allergies: [] }), Patient);
    await ok(call("patch", `/patients/${p.id}`, cookie, { nickname: "Bebe", tags: [], alerts: [] }), Patient);
    await ok(call("post", `/patients/${p.id}/consents`, cookie, { guardianId: "g_mother", scope: "extraction", date: "2026-10-02" }), Patient, 201);
    expect(await auditFor(p.id)).toEqual([
      { action: "create", record: "Patient profile" },
      { action: "create", record: "Privacy consent" },
      { action: "update", record: "Patient profile" },
      { action: "update", record: "Patient profile" },
      { action: "create", record: "Consent" },
    ]);
    const before = await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count());
    expect((await call("post", "/patients", cookie, { ...newPatient, tags: ["Recall due"] })).status).toBe(400);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count())).toBe(before);
  });

  it("answers 404 for another clinic's patient on every write", async () => {
    const p = await register(await as(ADMIN));
    const ngiti = await as(NGITI_OWNER);
    for (const [method, path, body] of [
      ["put", `/patients/${p.id}`, editable],
      ["patch", `/patients/${p.id}`, { nickname: "X", tags: [], alerts: [] }],
      ["post", `/patients/${p.id}/consents`, { guardianId: "g_mother", scope: "extraction", date: "2026-10-02" }],
    ] as const) {
      const res = await call(method, path, ngiti, body);
      expect([res.status, res.text], `${method} ${path}`).toEqual([404, "Patient not found"]);
    }
  });

  it("stores a new record in the caller's account only, guardian ids and all", async () => {
    const created = await register(await as(NGITI_OWNER));
    expect(created.clinicId).toBe("clinic_ngiti");
    const find = (clinicId: string) => inClinic(clinicId, () => prisma.patient.findUnique({ where: { id: created.id }, select: { id: true } }));
    expect(await find("clinic_ngiti")).not.toBeNull();
    expect(await find(DEMO_CLINIC_ID)).toBeNull();
    // Same guardian id (g_mother) in the demo clinic: the session names the clinic, so the two parents never meet.
    await register(await as(ADMIN));
    // The guardian signs in once invited (B11): her login in Ngiti only, as an accepted invite would make it.
    await prisma.credential.create({
      data: { clinicId: "clinic_ngiti", accountId: "guardian.g_mother", email: null, phone: null, staffId: null, guardianId: "g_mother", name: "Rosa Mendoza", passwordHash: "EXAMPLE-not-used", mustChange: false, pinHash: null, pinFailedAt: [] },
    });
    const parent = await as(["clinic_ngiti", "guardian.g_mother"]);
    expect((await ok(call("get", "/patients", parent), z.array(PatientView))).map((p) => p.id)).toEqual([created.id]);
  });
});
