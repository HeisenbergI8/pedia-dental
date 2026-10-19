import { DEMO_CLINIC_ID, type Db } from "@pedia/seed";
import { Appointment, AppointmentRequest, Message, Patient, TodaySummary, Visit, inStatusGroup, todaySummary, type RegisterPatientInput } from "@pedia/shared";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp, type Login } from "./clinical-support";
import { inClinic } from "./support/database";

/** apps/web's Today handler tests, and parity with the mock's todaySummary over the same seed (CHUNKS B7 done-when). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let today = ""; // the seed's day, pinned: a run across Manila midnight would otherwise compare two days
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const REYES: Login = [DEMO_CLINIC_ID, "staff_reyes"]; // a dentist at both branches
const [IMUS, DASMA] = ["branch_imus", "branch_dasma"];
beforeAll(async () => {
  t = await clinicalApp();
  today = format(new Date(), "yyyy-MM-dd");
}, 60_000);
afterAll(() => t.app.close());

const tenant = (clinicId: string): Db => t.platform.tenants[clinicId]!;
/** The mock's answer (dashboard/mocks.ts:20–25, 38–47), greetings included (B9). */
const expected = (db: Db, branchIds: string[], day = today) =>
  byChild(todaySummary({ ...db, appointments: db.appointments.filter((a) => branchIds.includes(a.branchId)) }, day));
/**
 * Birthdays in one order on both sides: the mock lists them in its array's order, the API by id (the seed's roster
 * ids and numbers don't follow its array, so two birthdays on one day could differ by the date the suite runs).
 */
const byChild = (s: TodaySummary): TodaySummary => ({ ...s, birthdays: [...s.birthdays].sort((a, b) => a.patientId.localeCompare(b.patientId)) });
const report = (cookie: string, query = `?today=${today}`) => t.call("get", `/reports/today${query}`, cookie);
const summary = async (cookie: string, query?: string) => byChild(await t.ok(report(cookie, query), TodaySummary));
const refused = async (cookie: string, query: string) => { const r = await report(cookie, query); return [r.status, r.text]; };

describe("Today matches the mock (done-when)", () => {
  it("for Bulilit's front desk at Imus, appointments in order", async () => {
    const got = await summary(await t.as(FRONT_DESK));
    expect(got).toEqual(expected(tenant(DEMO_CLINIC_ID), [IMUS]));
    // Not vacuous, except on a Sunday: the seed's clinic is closed then, so today has no appointments (seedAppointments).
    if (parseISO(today).getDay() !== 0) expect(got.appointments.length).toBeGreaterThan(0);
  });

  it("for a device at Dasmariñas, for all branches (Owner), and for the other branch (someone working at both)", async () => {
    const db = tenant(DEMO_CLINIC_ID);
    const reyes = await t.as(REYES);
    expect(await summary(`${reyes}; pd_branch=${DASMA}`)).toEqual(expected(db, [DASMA]));
    expect(await summary(await t.as(OWNER), `?today=${today}&branch=all`)).toEqual(expected(db, [IMUS, DASMA]));
    expect(await summary(reyes, `?today=${today}&branch=${DASMA}`)).toEqual(expected(db, [DASMA]));
  });

  it("for Ngiti, today and on its two appointments' day", async () => {
    const db = tenant("clinic_ngiti");
    const cookie = await t.as(NGITI_OWNER);
    expect(await summary(cookie)).toEqual(expected(db, [db.branches[0]!.id]));
    const day = format(new Date(db.appointments[0]!.startsAt), "yyyy-MM-dd"); // the next open day (seed-ngiti.ts)
    const got = await summary(cookie, `?today=${day}`);
    expect(got).toEqual(expected(db, [db.branches[0]!.id], day));
    expect(got.appointments).toHaveLength(2);
  });

  it("for every day of this week", async () => {
    const cookie = await t.as(OWNER);
    const monday = startOfWeek(parseISO(today), { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) {
      const day = format(addDays(monday, i), "yyyy-MM-dd");
      expect(await summary(cookie, `?today=${day}&branch=all`), day).toEqual(expected(tenant(DEMO_CLINIC_ID), [IMUS, DASMA], day));
    }
  });

  it("lists today's birthdays, turning their age, none greeted yet", async () => {
    const got = await summary(await t.as(FRONT_DESK));
    expect(got.birthdays.length).toBeGreaterThan(0);
    expect(got.birthdays.every((b) => b.greeting === undefined && b.turning > 0)).toBe(true);
  });
});

describe("Today's refusals and agreements (apps/web handlers.test.ts → today)", () => {
  it("refuses a bad day first, then branches the caller can't report on", async () => {
    const [desk, admin, ngiti] = [await t.as(FRONT_DESK), await t.as(ADMIN), await t.as(NGITI_OWNER)];
    expect(await refused(desk, "?today=2026-1-1")).toEqual([400, "today must be YYYY-MM-DD"]);
    expect(await refused(desk, "?today=2026-1-1&branch=nope")).toEqual([400, "today must be YYYY-MM-DD"]);
    for (const day of ["2026-13-45", "2026-02-30"]) expect(await refused(desk, `?today=${day}`)).toEqual([400, "today must be YYYY-MM-DD"]);
    expect(await refused(ngiti, "?branch=x")).toEqual([403, "Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade."]);
    expect(await refused(desk, `?branch=${DASMA}`)).toEqual([403, "Reports across branches need two open branches you work at"]);
    expect(await refused(await t.as(REYES), "?branch=all")).toEqual([403, "Only the clinic's Owner sees all branches together"]);
    expect((await report(admin)).status).toBe(200);
  });

  it("agrees with the calendar group by group, and with the request inbox, on every load", async () => {
    const desk = await t.as(FRONT_DESK);
    const from = new Date(`${today}T00:00:00+08:00`);
    const calendar = await t.ok(t.call("get", `/appointments?from=${from.toISOString()}&to=${addDays(from, 1).toISOString()}`, desk), z.array(Appointment));
    const inbox = await t.ok(t.call("get", "/appointment-requests?status=pending", desk), z.array(AppointmentRequest));
    const first = await summary(desk);
    expect(first.counts.total).toBe(calendar.length);
    expect(first.appointments.map((a) => a.id).sort()).toEqual(calendar.map((a) => a.id).sort());
    expect(first.counts.requests).toBe(inbox.length);
    for (const g of ["upcoming", "waiting", "done", "missed"] as const) expect(first.counts[g], g).toBe(calendar.filter((a) => inStatusGroup(g, a.status)).length);
    expect(inbox.length).toBeGreaterThan(0); // the roster seeds two: not vacuous
    expect(await summary(desk)).toEqual(first);
  });

  it("follows a booking from upcoming to waiting, in chair and done", async () => {
    const [admin, id] = [await t.as(ADMIN), await t.register()];
    const startsAt = new Date("2030-03-04T10:00:00+08:00").toISOString(); // a Monday
    const a = await t.ok(t.call("post", "/appointments", admin, { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt, durationMin: 30, reason: "Check-up" }), Appointment, 201);
    const on = async () => (await summary(admin, "?today=2030-03-04")).appointments.find((x) => x.id === a.id)!;
    expect(await on()).toMatchObject({ patientName: expect.stringMatching(/^Record\d+, Bea$/), dentistName: "Dr. Ana Reyes", status: "booked" });
    await t.ok(t.call("post", `/appointments/${a.id}/status`, admin, { status: "arrived" }), Appointment);
    expect((await summary(admin, "?today=2030-03-04")).counts.waiting).toBe(1);
    const visit = await t.ok(t.call("post", `/patients/${id}/visits`, admin, { dentistId: "staff_reyes", appointmentId: a.id }), Visit, 201);
    expect((await summary(admin, "?today=2030-03-04")).counts.inChair).toBe(1);
    await t.complete(visit.id, admin);
    const done = await summary(admin, "?today=2030-03-04");
    expect([done.counts.done, (await on()).status]).toEqual([1, "done"]);
    // First seen today (the visit's own day), so on 4 March 2030 the child is returning.
    expect(done.visitMix.find((d) => d.date === "2030-03-04")).toEqual({ date: "2030-03-04", new: 0, returning: 1 });
  });

  it("is for every staff role, not parents", async () => {
    for (const login of [OWNER, ADMIN, REYES, FRONT_DESK]) expect((await report(await t.as(login))).status).toBe(200);
    const guardianId = tenant(DEMO_CLINIC_ID).patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
    expect(await refused(await t.as([DEMO_CLINIC_ID, `guardian.${guardianId}`]), "")).toEqual([403, "You don't have access to this"]);
    const anyone = tenant(DEMO_CLINIC_ID).patients[0]!.id; // any patient: the 403 comes first
    const greet = await t.call("post", `/patients/${anyone}/birthday-greeting`, await t.as(REYES));
    expect([greet.status, greet.text]).toEqual([403, "You don't have access to this"]);
  });
});

describe("Today's greeting ticks (B9)", () => {
  it("shows a greeting queued, then sent, and leaves another birthday child without one", async () => {
    const desk = await t.as(FRONT_DESK);
    const born = (await summary(desk)).birthdays;
    expect(born.length).toBeGreaterThan(1); // the seed's roster has two (seed.ts)
    const [greeted, other] = born;
    await t.ok(t.call("post", `/patients/${greeted!.patientId}/birthday-greeting`, desk), Message, 201);
    const tick = async (patientId: string) => (await summary(desk)).birthdays.find((b) => b.patientId === patientId)!.greeting;
    expect(await tick(greeted!.patientId)).toBe("queued");
    const inHours = () => new Date().getHours() >= 8 && new Date().getHours() < 20; // Manila: the process is pinned
    const before = inHours();
    while ((await t.app.get(OutboxWorker).drain()) > 0);
    const after = await tick(greeted!.patientId);
    if (before === inHours()) expect(after).toBe(before ? "sent" : "queued"); // a run crossing 8 AM or 8 PM checks only that it moved on
    else expect(["queued", "sent"]).toContain(after);
    expect(await tick(other!.patientId)).toBeUndefined();
  });
});

describe("Today at scale (B14)", () => {
  it("names, birthdays and visitMix come from only this week's and today's patients", async () => {
    const [owner, desk] = [await t.as(OWNER), await t.as(FRONT_DESK)];
    const born = async (birthDate: string) => {
      const body = {
        firstName: "Tala", lastName: `Born${birthDate.replaceAll("-", "")}`, birthDate, sex: "female", address: "",
        guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234568", isPrimary: true }],
        emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
        dentalHistory: { previousClinic: "", notes: "" }, privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
      } as RegisterPatientInput;
      return (await t.ok(t.call("post", "/patients", desk, body), Patient, 201)).id;
    };
    const birthday = `2019-${today.slice(5)}`;
    const [child, restricted, leap, seen] = [await born(birthday), await born(birthday), await born("2020-02-29"), await t.register()];
    await inClinic(DEMO_CLINIC_ID, () => t.prisma.patient.update({ where: { id: restricted }, data: { restrictedAt: new Date() } }));
    // Seen this week, first seen last year: returning today.
    const first = await t.start(seen, owner);
    await t.complete(first.id, owner);
    await inClinic(DEMO_CLINIC_ID, () => t.prisma.visit.update({ where: { id: first.id }, data: { date: new Date(`${Number(today.slice(0, 4)) - 1}${today.slice(4)}T00:00:00.000Z`) } }));
    await t.complete((await t.start(seen, owner)).id, owner);

    // The oracle: the shared todaySummary over every patient, visit and done appointment.
    const all = await inClinic(DEMO_CLINIC_ID, async () => ({
      patients: (await t.prisma.patient.findMany({ where: { restrictedAt: null }, select: { id: true, firstName: true, lastName: true, birthDate: true } }))
        .map((p) => ({ ...p, birthDate: p.birthDate.toISOString().slice(0, 10) })),
      visits: (await t.prisma.visit.findMany({ where: { status: "completed" }, select: { patientId: true, status: true, date: true } }))
        .map((v) => ({ ...v, date: v.date.toISOString().slice(0, 10) })),
      appointments: (await t.prisma.appointment.findMany({ where: { status: "done" } })).map((a) => ({ ...a, startsAt: a.startsAt.toISOString() })),
      messages: (await t.prisma.message.findMany({ where: { kind: "birthday" } })).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
    }));
    const oracle = byChild(todaySummary({ ...all, staff: [], appointmentRequests: [] } as unknown as Parameters<typeof todaySummary>[0], today));
    const got = await summary(owner, `?today=${today}&branch=all`);
    expect(got.birthdays).toEqual(oracle.birthdays);
    expect(got.visitMix).toEqual(oracle.visitMix);
    const ids = got.birthdays.map((b) => b.patientId);
    expect(ids).toContain(child);
    expect(ids).not.toContain(restricted); // E6
    if (today.slice(5) !== "02-29") expect(ids).not.toContain(leap);
    expect(got.visitMix.find((d) => d.date === today)!.returning).toBeGreaterThan(0);
  });
});
