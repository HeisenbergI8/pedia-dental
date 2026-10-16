import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { DuplicateMatch, PatientHeaderSummary, PatientPage, PatientView, type Patient } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { patientRows } from "../../src/patients/patient.rows";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web's patient handler tests (reads), against the API (CHUNKS B4 done-when, decisions 1, 3, 4, 5). */
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const parentsChildren = childrenOf(db, parentGuardianId).map((p) => p.id);

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const get = (path: string, cookie: string) => request(app.getHttpServer()).get(`/api${path}`).set("Cookie", cookie);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(200);
  return schema.parse(r.body);
};

const kid = (id: string, no: number, o: Partial<Patient> = {}): Patient => ({
  id, clinicId: DEMO_CLINIC_ID, patientNo: `KS-9${String(no).padStart(4, "0")}`, firstName: "Kid", lastName: "Fixture",
  birthDate: "2019-03-02", sex: "female", guardians: [], allergies: [], medicalConditions: [], medications: [], alerts: [],
  dentalHistory: { previousClinic: "", notes: "" }, consents: [], createdAt: "2026-10-01T02:00:00.000Z", ...o,
});
const guardian = (id: string, fullName: string, phone: string, email?: string) => ({ id, fullName, relationship: "Mother", phone, email, isPrimary: true });

const BEA = kid("pt_bea", 1, {
  firstName: "Bea", lastName: "Mendoza", address: "12 Mabini St", emergencyContact: { name: "Lola Iska", phone: "09180000000" },
  guardians: [guardian("g_rosa", "Rosa Mendoza", "09171234567", "rosa@example.com")],
});
const JOSE = kid("pt_jose", 2, { firstName: "José", lastName: "Ramos", guardians: [guardian("g_jose", "Ana Ramos", "09170000002")] });
const LITERAL = kid("pt_literal", 3, { firstName: "Percent", lastName: "Sign", guardians: [guardian("g_lit", "Pat Sign", "09170000003")] });
const TWIN_A = kid("pt_twin_a", 4, { firstName: "Tala", lastName: "Twin", guardians: [guardian("g_twin_a", "Mama Twin", "09175550101")] });
const TWIN_B = kid("pt_twin_b", 5, { firstName: "Tino", lastName: "Twin", guardians: [guardian("g_twin_b", "Papa Twin", "09175550101")] });

async function insert(...patients: Patient[]) {
  await inClinic(DEMO_CLINIC_ID, async () => {
    for (const p of patients) {
      const r = patientRows(p);
      await prisma.patient.create({ data: { ...r.patient, clinicId: DEMO_CLINIC_ID } });
      await prisma.patientGuardian.createMany({ data: r.guardians.map((g) => ({ ...g, clinicId: DEMO_CLINIC_ID })) });
    }
  });
}

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
  await insert(BEA, JOSE, LITERAL, TWIN_A, TWIN_B);
}, 60_000);
afterAll(() => app.close());

const directory = async (cookie: string, q: string) => ok(get(`/patients?q=${encodeURIComponent(q)}`, cookie), z.array(PatientView));
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("search (decision 1: the mock's matchesSearch)", () => {
  it("finds a patient by child name, guardian name or guardian phone, every word required", async () => {
    const cookie = await as(FRONT_DESK);
    for (const q of ["bea mend", "Rosa Mendoza", "0917 123 4567", "1234567", "Mendoza Rosa", "Bea R", "0917-123-4567"]) {
      expect(ids(await directory(cookie, q)), q).toContain(BEA.id);
    }
    expect(ids(await directory(cookie, "Bea Zz"))).not.toContain(BEA.id);
  });

  it("matches LIKE's wildcards literally and compares bytes, as the mock's includes", async () => {
    const cookie = await as(FRONT_DESK);
    expect(await directory(cookie, "_")).toEqual([]);
    expect(await directory(cookie, "%")).toEqual([]);
    expect(ids(await directory(cookie, "josé"))).toEqual([JOSE.id]);
    expect(ids(await directory(cookie, "jose"))).not.toContain(JOSE.id);
  });
});

describe("contacts (CONVENTIONS → Contact data)", () => {
  it("shows guardian phones to front desk, not to a dentist, and phone search only to front desk", async () => {
    const desk = await ok(get("/patient-summaries?pageSize=100", await as(FRONT_DESK)), PatientPage);
    expect(desk.rows.every((r) => r.guardianPhone)).toBe(true);
    const dentist = await ok(get("/patient-summaries?pageSize=100", await as(DENTIST)), PatientPage);
    expect(dentist.rows.some((r) => r.guardianPhone)).toBe(false);
    expect((await ok(get("/patient-summaries?q=1234567", await as(FRONT_DESK)), PatientPage)).total).toBeGreaterThan(0);
    expect((await ok(get("/patient-summaries?q=1234567", await as(DENTIST)), PatientPage)).total).toBe(0);
  });

  it("sends a dentist no guardian phone, email, address or emergency contact from any read", async () => {
    const cookie = await as(DENTIST);
    const bodies = await Promise.all(
      [`/patients/${BEA.id}`, "/patients?q=bea", "/patient-summaries?q=bea", `/patients/${BEA.id}/summary`].map(async (path) => (await get(path, cookie)).text),
    );
    expect(bodies.join("\n")).not.toMatch(/09171234567|rosa@example\.com|Mabini|Lola Iska|09180000000/);
    const desk = await ok(get(`/patients/${BEA.id}`, await as(FRONT_DESK)), PatientView);
    expect([desk.address, desk.emergencyContact?.name, desk.guardians[0]!.phone, desk.guardians[0]!.email]).toEqual([
      "12 Mabini St", "Lola Iska", "09171234567", "rosa@example.com",
    ]);
  });
});

describe("the list (decision 3)", () => {
  it("pages with a total, and clamps a page past the end", async () => {
    const cookie = await as(ADMIN);
    const first = await ok(get("/patient-summaries?pageSize=10&page=1", cookie), PatientPage);
    expect(first.total).toBe(db.patients.length + 5);
    const second = await ok(get("/patient-summaries?pageSize=10&page=2", cookie), PatientPage);
    expect(ids(first.rows).filter((id) => ids(second.rows).includes(id))).toEqual([]);
    const past = await ok(get("/patient-summaries?pageSize=10&page=99", cookie), PatientPage);
    expect([past.page, past.rows.length > 0]).toEqual([Math.ceil(first.total / 10), true]);
  });

  it("counts every patient under All, and nothing under the filters later chunks fill", async () => {
    const cookie = await as(ADMIN);
    const page = await ok(get("/patient-summaries?pageSize=100", cookie), PatientPage);
    expect(page.counts).toEqual({ all: page.total, needs_attention: 0, recent_visit: 0, balance_due: 0, recall_due: 0 });
    expect(page.rows.every((r) => !r.flags.recallDue && !r.flags.balanceDue && !r.flags.noContact)).toBe(true);
    expect(page.rows.every((r) => r.balance === 0 && r.lastVisitOn === undefined && r.recallDueOn === undefined)).toBe(true);
    const due = await ok(get("/patient-summaries?filter=recall_due", cookie), PatientPage);
    expect([due.total, due.rows]).toEqual([0, []]);
  });

  it.todo("balances agree with the financial dashboard (B8)");
  it.todo("recall due matches /recall (B7)");
});

describe("parents (decision 5)", () => {
  it("lists exactly a parent's children, with their contacts", async () => {
    const cookie = await as(PARENT);
    expect(ids(await directory(cookie, "")).sort()).toEqual([...parentsChildren].sort());
    const page = await ok(get("/patient-summaries", cookie), PatientPage);
    expect(ids(page.rows).sort()).toEqual([...parentsChildren].sort());
    expect(page.rows.every((r) => r.guardianPhone)).toBe(true);
  });

  it("opens their own child's record and refuses another family's", async () => {
    const cookie = await as(PARENT);
    expect((await get(`/patients/${parentsChildren[0]}`, cookie)).status).toBe(200);
    const other = await get(`/patients/${BEA.id}`, cookie);
    expect([other.status, other.text]).toEqual([403, "This isn't one of your children's records"]);
  });
});

describe("audit (done-when, decision 4)", () => {
  const views = (actorId: string, patientId: string) =>
    inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { actorId, action: "view", record: "Patient profile", patientId } }));
  const allEvents = () => inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count());

  it("writes one entry per record view, none for lists, searches or a missing record", async () => {
    const dentist = await as(DENTIST);
    await get(`/patients/${TWIN_A.id}`, dentist);
    await get(`/patients/${TWIN_A.id}/summary`, dentist);
    await get(`/patients/${TWIN_A.id}`, dentist);
    expect(await views("staff_reyes", TWIN_A.id)).toBe(1);
    await get(`/patients/${TWIN_A.id}`, await as(FRONT_DESK));
    expect(await views("staff_cruz", TWIN_A.id)).toBe(1);

    const before = await allEvents();
    await get("/patients?q=twin", dentist);
    await get("/patient-summaries?q=twin", dentist);
    await get("/patient-duplicates?firstName=Tala&lastName=Twin&birthDate=2019-03-02", await as(FRONT_DESK));
    expect((await get("/patients/nobody", dentist)).status).toBe(404);
    expect(await allEvents()).toBe(before);
  });
});

describe("header summary and duplicates", () => {
  it("gives the money with billing.view and names siblings sharing a guardian phone, for a dentist too", async () => {
    const admin = await ok(get(`/patients/${TWIN_A.id}/summary`, await as(ADMIN)), PatientHeaderSummary);
    expect(admin).toEqual({ patientId: TWIN_A.id, patientNo: TWIN_A.patientNo, balance: 0, credit: 0, siblings: [{ id: TWIN_B.id, firstName: "Tino" }] });
    const dentist = await ok(get(`/patients/${TWIN_A.id}/summary`, await as(DENTIST)), PatientHeaderSummary);
    expect(dentist.siblings).toEqual([{ id: TWIN_B.id, firstName: "Tino" }]); // a dentist holds billing.view too, as in the mock
  });

  it("finds a duplicate by name and birth date, ignoring case, without contacts", async () => {
    const cookie = await as(FRONT_DESK);
    const res = await get(`/patient-duplicates?firstName=BEA&lastName=mendoza&birthDate=${BEA.birthDate}`, cookie);
    expect(z.array(DuplicateMatch).parse(res.body).map((d) => d.id)).toEqual([BEA.id]);
    expect(res.text).not.toMatch(/0917|guardians/);
    expect((await ok(get("/patient-duplicates?firstName=Bea&lastName=Mendoza&birthDate=2018-01-01", cookie), z.array(DuplicateMatch)))).toEqual([]);
    expect((await ok(get("/patient-duplicates?firstName=Bea&lastName=Mendoza&birthDate=nonsense", cookie), z.array(DuplicateMatch)))).toEqual([]);
  });
});

describe("tenancy", () => {
  it("never shows another clinic's patients", async () => {
    const cookie = await as(NGITI_OWNER);
    const res = await get(`/patients/${BEA.id}`, cookie);
    expect([res.status, res.text]).toEqual([404, "Patient not found"]);
    const theirs = ids(await directory(cookie, ""));
    expect(theirs.filter((id) => db.patients.some((p) => p.id === id) || id.startsWith("pt_"))).toEqual([]);
  });
});
