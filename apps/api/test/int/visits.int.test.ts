import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { Appointment, Patient, PatientHeaderSummary, PatientPage, Visit, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { FixedClock } from "../../src/common/clock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web's visit handler tests, against the API (CHUNKS B5). Cases share one seeded database. */
const platform = seedPlatform();
// 00:30 on 2 June in Manila: the clinic's day differs from UTC's.
const clock = new FixedClock(new Date("2026-06-01T16:30:00.000Z"));
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];

beforeAll(async () => {
  app = await createIntApp({ clock });
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post", path: string, cookie: string, body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};

let n = 0;
const newPatient = (): RegisterPatientInput => ({
  firstName: "Bea", lastName: `Visit${++n}`, birthDate: "2020-07-02", sex: "female", address: "",
  guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
  emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
  privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
} as RegisterPatientInput);
const register = async () => (await ok(call("post", "/patients", await as(FRONT_DESK), newPatient()), Patient, 201)).id;
const start = async (patientId: string, cookie: string, body: object = { dentistId: "staff_reyes" }) => call("post", `/patients/${patientId}/visits`, cookie, body);
/** Moves the fixed clock on a second: audit rows are ordered by time, and a session idles out after 30 minutes. */
const tick = () => clock.set(new Date(clock.now().getTime() + 1000));
const auditOf = (patientId: string) =>
  inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.findMany({ where: { patientId }, orderBy: { at: "asc" }, select: { action: true, record: true } }));

describe("visits (apps/web handlers.test.ts → visits)", () => {
  it("starts one visit at a time, lists it first, and completes it", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const visit = await ok(start(id, admin), Visit, 201);
    expect(visit.status).toBe("in_progress");
    const again = await start(id, admin);
    expect([again.status, again.text]).toEqual([409, "This patient already has a visit in progress"]);
    tick();
    const done = await ok(call("post", `/visits/${visit.id}/complete`, admin), Visit);
    expect([done.status, done.completedAt]).toEqual(["completed", clock.now().toISOString()]);
    tick();
    const next = await ok(start(id, admin), Visit, 201);
    const list = await ok(call("get", `/patients/${id}/visits`, admin), z.array(Visit));
    expect(list.map((v) => v.id)).toEqual([next.id, visit.id]);
  });

  it("dates a visit by the clinic's day, and stamps it with the clock", async () => {
    clock.set(new Date("2026-06-01T16:30:00.000Z"));
    const visit = await ok(start(await register(), await as(ADMIN)), Visit, 201);
    expect([visit.date, visit.startedAt]).toEqual(["2026-06-02", "2026-06-01T16:30:00.000Z"]);
  });

  it("keeps no appointment for a visit started without one", async () => {
    expect(await ok(start(await register(), await as(ADMIN)), Visit, 201)).not.toHaveProperty("appointmentId");
  });

  describe("started from an appointment (B7, appointments/mocks.ts #2, #4)", () => {
    // One 30-minute slot each, far from the seeded fortnight: Mondays in 2030, Manila times (E3).
    let k = 0;
    const slotAt = () => { const i = k++; return new Date(`2030-02-${String(4 + 7 * Math.floor(i / 18)).padStart(2, "0")}T08:00:00+08:00`).getTime() + (i % 18) * 30 * 60_000; };
    const book = async (patientId: string, admin: string) =>
      ok(call("post", "/appointments", admin, { patientId, dentistId: "staff_reyes", chairId: "chair_1", startsAt: new Date(slotAt()).toISOString(), durationMin: 30, reason: "Check-up" }), Appointment, 201);
    const setStatus = (id: string, admin: string, body: object) => call("post", `/appointments/${id}/status`, admin, body);
    const arrived = async (patientId: string, admin: string) => {
      const a = await book(patientId, admin);
      return ok(setStatus(a.id, admin, { status: "arrived" }), Appointment);
    };
    const statusOf = async (id: string) => (await inClinic(DEMO_CLINIC_ID, () => prisma.appointment.findUniqueOrThrow({ where: { id }, select: { status: true } }))).status;
    const visits = (patientId: string) => inClinic(DEMO_CLINIC_ID, () => prisma.visit.count({ where: { patientId } }));

    it("seats an arrived appointment, and completing the visit marks it done", async () => {
      const admin = await as(ADMIN);
      const id = await register();
      const a = await arrived(id, admin);
      const visit = await ok(start(id, admin, { dentistId: "staff_reyes", appointmentId: a.id }), Visit, 201);
      expect([visit.appointmentId, await statusOf(a.id)]).toEqual([a.id, "in_chair"]);
      tick();
      await ok(call("post", `/visits/${visit.id}/complete`, admin), Visit);
      expect(await statusOf(a.id)).toBe("done");
      const header = await ok(call("get", `/patients/${id}/summary`, admin), PatientHeaderSummary);
      expect(header.lastVisitOn).toBe(clock.today());
    });

    it("refuses a booked appointment not yet checked in, another child's, and an unknown one", async () => {
      const admin = await as(ADMIN);
      const [id, other] = [await register(), await register()];
      const booked = await book(id, admin);
      const notIn = await start(id, admin, { dentistId: "staff_reyes", appointmentId: booked.id });
      expect([notIn.status, notIn.text]).toEqual([409, "Check the patient in before starting the visit"]);
      const theirs = await arrived(other, admin);
      for (const appointmentId of [theirs.id, "appointment_nobody"]) {
        const res = await start(id, admin, { dentistId: "staff_reyes", appointmentId });
        expect([res.status, res.text]).toEqual([404, "Appointment not found"]);
      }
      expect([await visits(id), await statusOf(booked.id), await statusOf(theirs.id)]).toEqual([0, "booked", "arrived"]);
    });

    it("answers a visit in progress before looking at the appointment", async () => {
      const admin = await as(ADMIN);
      const id = await register();
      await ok(start(id, admin), Visit, 201);
      const res = await start(id, admin, { dentistId: "staff_reyes", appointmentId: "appointment_nobody" });
      expect([res.status, res.text]).toEqual([409, "This patient already has a visit in progress"]);
    });

    it("seats one of five parallel starts from the same arrived appointment", async () => {
      const admin = await as(ADMIN);
      const id = await register();
      const a = await arrived(id, admin);
      const answers = await Promise.all(Array.from({ length: 5 }, () => start(id, admin, { dentistId: "staff_reyes", appointmentId: a.id })));
      expect(answers.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
      expect([await visits(id), await statusOf(a.id)]).toEqual([1, "in_chair"]);
    });

    it("lets exactly one of a start and a cancel win, round after round", async () => {
      const admin = await as(ADMIN);
      for (let round = 0; round < 20; round++) {
        const id = await register();
        const a = await arrived(id, admin);
        const [started, cancelled] = await Promise.all([
          start(id, admin, { dentistId: "staff_reyes", appointmentId: a.id }),
          setStatus(a.id, admin, { status: "cancelled", cancelReason: "Family left" }),
        ]);
        const status = await statusOf(a.id);
        if (started.status === 201) expect([cancelled.status, status, await visits(id)], `round ${round}`).toEqual([409, "in_chair", 1]);
        else expect([started.status, cancelled.status, status, await visits(id)], `round ${round}`).toEqual([409, 200, "cancelled", 0]);
      }
    });
  });

  it("serves the seeded visits newest first, all completed", async () => {
    const db = platform.tenants[DEMO_CLINIC_ID]!;
    const patient = db.patients.find((p) => db.visits.filter((v) => v.patientId === p.id).length >= 2)!;
    const seeded = db.visits.filter((v) => v.patientId === patient.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const list = await ok(call("get", `/patients/${patient.id}/visits`, await as(ADMIN)), z.array(Visit));
    expect(list).toEqual(seeded.map((v) => ({ ...v, clinicId: DEMO_CLINIC_ID })));
    expect(list.every((v) => v.status === "completed")).toBe(true);
  });

  it("answers in the mock's order, with its words", async () => {
    const admin = await as(ADMIN);
    const unknown = await start("no_such_patient", admin, {});
    expect([unknown.status, unknown.text]).toEqual([404, "Patient not found"]); // not the body's 400
    const id = await register();
    const bad = await start(id, admin, {});
    expect(bad.status).toBe(400);
    expect(z.array(z.object({ path: z.array(z.unknown()) })).parse(bad.body)[0]!.path).toEqual(["dentistId"]);
    const missing = await call("post", "/visits/no_such_visit/complete", admin);
    expect([missing.status, missing.text, missing.type]).toEqual([404, "Visit not found", "text/plain"]);
    const visit = await ok(start(id, admin), Visit, 201);
    await ok(call("post", `/visits/${visit.id}/complete`, admin), Visit);
    const twice = await call("post", `/visits/${visit.id}/complete`, admin);
    expect([twice.status, twice.text, twice.type]).toEqual([409, "Visit is already completed", "text/plain"]);
  });

  it("lets front desk read visits but not start or complete one", async () => {
    const id = await register();
    const visit = await ok(start(id, await as(ADMIN)), Visit, 201);
    const desk = await as(FRONT_DESK);
    expect((await call("get", `/patients/${id}/visits`, desk)).status).toBe(200);
    const refused = await start(id, desk);
    expect([refused.status, refused.text]).toEqual([403, "You don't have access to this"]);
    expect((await call("post", `/visits/${visit.id}/complete`, desk)).status).toBe(403);
  });

  it("never reaches another clinic's visit", async () => {
    const id = await register();
    const visit = await ok(start(id, await as(ADMIN)), Visit, 201);
    const ngiti = await as(NGITI_OWNER);
    const res = await call("post", `/visits/${visit.id}/complete`, ngiti);
    expect([res.status, res.text]).toEqual([404, "Visit not found"]);
    expect(await ok(call("get", `/patients/${id}/visits`, ngiti), z.array(Visit))).toEqual([]);
  });

  it("audits every read and change, and a refused write leaves nothing", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const visit = await ok(start(id, admin), Visit, 201);
    tick();
    expect((await start(id, admin)).status).toBe(409);
    tick();
    await ok(call("get", `/patients/${id}/visits`, admin), z.array(Visit));
    tick();
    await ok(call("get", `/patients/${id}/visits`, admin), z.array(Visit)); // within five minutes: no second entry
    tick();
    await ok(call("post", `/visits/${visit.id}/complete`, admin), Visit);
    const visitRows = (await auditOf(id)).filter((e) => /^Visit/.test(e.record));
    expect(visitRows).toEqual([
      { action: "create", record: "Visit" },
      { action: "view", record: "Visits" },
      { action: "update", record: "Visit (completed)" },
    ]);
  });

  it("starts exactly one visit under parallel requests (decision 5)", async () => {
    const admin = await as(ADMIN);
    for (let round = 0; round < 3; round++) {
      const id = await register();
      const results = await Promise.all(Array.from({ length: 10 }, () => start(id, admin)));
      expect(results.map((r) => r.status).sort()).toEqual([201, ...Array(9).fill(409)]);
      expect(await inClinic(DEMO_CLINIC_ID, () => prisma.visit.count({ where: { patientId: id, status: "in_progress" } }))).toBe(1);
    }
  });

  it("completes a visit exactly once under parallel requests", async () => {
    const admin = await as(ADMIN);
    for (let round = 0; round < 3; round++) {
      const visit = await ok(start(await register(), admin), Visit, 201);
      const results = await Promise.all(Array.from({ length: 10 }, () => call("post", `/visits/${visit.id}/complete`, admin)));
      expect(results.map((r) => r.status).sort()).toEqual([200, ...Array(9).fill(409)]);
    }
  });

  it("fills the last visit in the header and the list, from completed visits only", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const header = () => ok(call("get", `/patients/${id}/summary`, admin), PatientHeaderSummary);
    expect(await header()).not.toHaveProperty("lastVisitOn");
    tick();
    const visit = await ok(start(id, admin), Visit, 201);
    expect(await header()).not.toHaveProperty("lastVisitOn"); // in progress doesn't count
    tick();
    await ok(call("post", `/visits/${visit.id}/complete`, admin), Visit);
    expect((await header()).lastVisitOn).toBe(visit.date);
    const page = await ok(call("get", `/patient-summaries?q=${encodeURIComponent(`Visit${n}`)}`, admin), PatientPage);
    expect(page.rows.find((r) => r.id === id)?.lastVisitOn).toBe(visit.date);
  });

  // Last: it deactivates a seeded dentist.
  it("only lets an active dentist run a visit", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const ngitiDentist = platform.tenants.clinic_ngiti!.staff.find((s) => s.role === "dentist")!.id;
    for (const dentistId of ["staff_cruz", "no_such_staff", ngitiDentist]) {
      const res = await start(id, admin, { dentistId });
      expect([res.status, res.text], dentistId).toEqual([400, "Unknown dentist"]);
    }
    expect((await call("post", "/staff/staff_santos/deactivate", await as(OWNER))).status).toBe(200);
    const res = await start(id, admin, { dentistId: "staff_santos" });
    expect([res.status, res.text]).toEqual([400, "Unknown dentist"]);
  });
});
