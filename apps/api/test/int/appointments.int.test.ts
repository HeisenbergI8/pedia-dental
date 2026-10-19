import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment, findConflict, reminderSendAt } from "@pedia/shared";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OutboxService } from "../../src/outbox/outbox.service";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp, type Login } from "./clinical-support";

/** apps/web's appointment handler tests, against the API (CHUNKS B7), with the double-booking races (E1). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
let owner = ""; // the Owner works at both branches; the admin at Imus only
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
beforeAll(async () => {
  t = await clinicalApp();
  admin = await t.as(ADMIN);
  owner = await t.as(OWNER);
}, 60_000);
afterAll(() => t.app.close());

const dasma = (cookie: string) => `${cookie}; pd_branch=branch_dasma`;
// Weekdays far from the seeded fortnight; hh:mm are Manila times (the process is pinned, E3).
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+08:00`).toISOString();
const slot = (patientId: string, over: object = {}) => ({ patientId, dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-01-07", "09:00"), durationMin: 30, reason: "Check-up", ...over });
const book = (body: object, cookie = admin) => t.call("post", "/appointments", cookie, body);
const move = (id: string, body: object, cookie = admin) => t.call("put", `/appointments/${id}`, cookie, { reason: "Check-up", ...body });
const status = (id: string, body: object, cookie = admin) => t.call("post", `/appointments/${id}/status`, cookie, body);
const calendar = async (cookie: string, query = "") => t.ok(t.call("get", `/appointments${query}`, cookie), z.array(Appointment));
const rows = (where: object) => inClinic(DEMO_CLINIC_ID, () => t.prisma.appointment.count({ where }));
const audit = (patientId: string) =>
  inClinic(DEMO_CLINIC_ID, () => t.prisma.auditEvent.findMany({ where: { patientId, record: { startsWith: "Appointment" } }, orderBy: { at: "asc" }, select: { action: true, record: true } }));

describe("appointments (apps/web handlers.test.ts → appointments)", () => {
  it("refuses a booking outside clinic hours or on a closed day, and a move there", async () => {
    const id = await t.register();
    for (const [startsAt, words] of [
      [at("2030-01-15", "07:15"), "Book between 8:00 AM and 6:00 PM."],
      [at("2030-01-13", "09:00"), "The clinic is closed on Sundays. Pick another day."],
      [at("2030-01-15", "17:45"), "Book between 8:00 AM and 6:00 PM."],
    ] as const) {
      const res = await book(slot(id, { startsAt }));
      expect([res.status, res.text]).toEqual([400, words]);
    }
    const booked = await t.ok(book(slot(id, { startsAt: at("2030-01-15", "09:00") })), Appointment, 201);
    expect((await move(booked.id, { dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-01-13", "09:00"), durationMin: 30 })).status).toBe(400);
  });

  it("books at the device's branch, refuses a busy dentist in another chair, and frees a slot on a move", async () => {
    const [a, b] = [await t.register(), await t.register()];
    const first = await t.ok(book(slot(a, { startsAt: at("2030-01-08", "09:00") })), Appointment, 201);
    expect([first.status, first.branchId]).toEqual(["booked", "branch_imus"]);
    const clash = await book(slot(b, { chairId: "chair_2", startsAt: at("2030-01-08", "09:15") }));
    expect([clash.status, clash.text]).toEqual([409, "Dr. Ana Reyes is already booked at 9:00 AM"]);
    await t.ok(move(first.id, { dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-01-08", "11:00"), durationMin: 30 }), Appointment);
    await t.ok(book(slot(b, { chairId: "chair_2", startsAt: at("2030-01-08", "09:15") })), Appointment, 201);
    expect((await t.ok(status(first.id, { status: "confirmed" }), Appointment)).status).toBe("confirmed");
    expect((await t.ok(status(first.id, { status: "arrived" }), Appointment)).status).toBe("arrived");
  });

  it("follows the status rules, needs a reason to cancel, and frees the slot", async () => {
    const id = await t.register();
    const s = slot(id, { startsAt: at("2030-01-09", "09:00") });
    const a = await t.ok(book(s), Appointment, 201);
    await t.ok(status(a.id, { status: "no_show" }), Appointment);
    const back = await status(a.id, { status: "arrived" });
    expect([back.status, back.text]).toEqual([409, "Can't go from no_show to arrived"]);
    const b = await t.ok(book(s), Appointment, 201); // a no-show frees the slot
    const noReason = await status(b.id, { status: "cancelled", cancelReason: " " });
    expect([noReason.status, JSON.stringify(noReason.body)]).toEqual([400, expect.stringContaining("Give a reason")]);
    expect((await t.ok(status(b.id, { status: "cancelled", cancelReason: "Sick" }), Appointment)).cancelReason).toBe("Sick");
    await t.ok(book(s), Appointment, 201);
  });

  it("answers in the mock's order, with its words", async () => {
    expect((await book({ patientId: "no_such_patient" })).status).toBe(400); // the body first
    const unknown = await book(slot("no_such_patient"));
    expect([unknown.status, unknown.text]).toEqual([404, "Patient not found"]);
    const missing = await move("no_such_appointment", { nonsense: true });
    expect([missing.status, missing.text, missing.type]).toEqual([404, "Appointment not found", "text/plain"]);
    const id = await t.register();
    const a = await t.ok(book(slot(id, { startsAt: at("2030-01-10", "09:00") })), Appointment, 201);
    await t.ok(status(a.id, { status: "arrived" }), Appointment);
    const arrived = await move(a.id, { dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-01-10", "10:00"), durationMin: 30 });
    expect([arrived.status, arrived.text]).toEqual([409, "Only booked or confirmed appointments can be moved"]);
    expect((await status(a.id, { status: "done" })).status).toBe(400); // not in the input
  });

  it("reaches every slot refusal through HTTP, in the mock's words", async () => {
    const id = await t.register();
    const day = (hhmm: string) => at("2030-01-11", hhmm);
    const desk = await book(slot(id, { dentistId: "staff_cruz", startsAt: day("09:00") }));
    expect([desk.status, desk.text]).toEqual([400, "Unknown dentist"]);
    const santos = await book(slot(id, { dentistId: "staff_santos", chairId: "chair_4", startsAt: day("10:00") }), dasma(owner));
    expect([santos.status, santos.text]).toEqual([400, "Dr. Miguel Santos doesn't work at this branch"]);
    const chair = await book(slot(id, { chairId: "chair_4", startsAt: day("11:00") }));
    expect([chair.status, chair.text]).toEqual([400, "Choose a chair at this branch"]);
    const late = await book(slot(id, { chairId: "chair_4", startsAt: day("17:00") }), dasma(owner));
    expect([late.status, late.text]).toEqual([400, "Book between 9:00 AM and 5:00 PM."]); // Dasmariñas's own hours, not Imus's 6 PM
  });

  it("keeps each branch's calendar to its own bookings, in a half-open window", async () => {
    const id = await t.register();
    const imus = await t.ok(book(slot(id, { startsAt: at("2030-01-14", "09:00") })), Appointment, 201);
    const there = await t.ok(book(slot(id, { chairId: "chair_4", startsAt: at("2030-01-14", "11:00") }), dasma(owner)), Appointment, 201);
    expect(there.branchId).toBe("branch_dasma");
    const window = `?from=${encodeURIComponent(at("2030-01-14", "00:00"))}&to=${encodeURIComponent(at("2030-01-14", "11:00"))}`;
    expect((await calendar(admin, window)).map((a) => a.id)).toEqual([imus.id]);
    expect((await calendar(dasma(owner), window)).map((a) => a.id)).toEqual([]); // 11:00 is outside [from, to)
    expect(await calendar(admin, "?from=nonsense")).toEqual([]);
    // No bounds, or one only: open-ended, as the mock (MySQL can't compare the mock's 8.64e15 default, so it's clamped).
    for (const query of ["", `?from=${encodeURIComponent(at("2030-01-14", "00:00"))}`, `?to=${encodeURIComponent("+275000-01-01T00:00:00Z")}`]) {
      expect((await calendar(admin, query)).map((a) => a.id), query).toContain(imus.id);
    }
    // A dentist at both branches sees each device branch's own bookings, the whole day (tenancy.test.ts).
    const reyes = await t.as([DEMO_CLINIC_ID, "staff_reyes"] as Login);
    const wholeDay = `?from=${encodeURIComponent(at("2030-01-14", "00:00"))}&to=${encodeURIComponent(at("2030-01-15", "00:00"))}`;
    expect((await calendar(`${reyes}; pd_branch=branch_dasma`, wholeDay)).map((a) => a.id)).toEqual([there.id]);
    expect((await calendar(`${reyes}; pd_branch=branch_imus`, wholeDay)).map((a) => a.id)).toEqual([imus.id]);
  });

  it("lists a child's appointments at every branch, by start, and audits the read", async () => {
    const id = await t.register();
    const late = await t.ok(book(slot(id, { startsAt: at("2030-01-16", "14:00") })), Appointment, 201);
    const early = await t.ok(book(slot(id, { chairId: "chair_4", startsAt: at("2030-01-16", "09:00") }), dasma(owner)), Appointment, 201);
    const list = await t.ok(t.call("get", `/patients/${id}/appointments`, admin), z.array(Appointment));
    expect(list.map((a) => a.id)).toEqual([early.id, late.id]);
    expect((await audit(id)).filter((e) => e.action === "view")).toEqual([{ action: "view", record: "Appointments" }]);
  });

  it("audits each change once, and a refusal or the calendar writes nothing", async () => {
    const id = await t.register();
    const a = await t.ok(book(slot(id, { startsAt: at("2030-01-17", "09:00") })), Appointment, 201);
    await t.ok(move(a.id, { dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-01-17", "10:00"), durationMin: 30 }), Appointment);
    await t.ok(status(a.id, { status: "confirmed" }), Appointment);
    expect((await status(a.id, { status: "done" })).status).toBe(400);
    expect((await book(slot(id, { startsAt: at("2030-01-17", "07:00") }))).status).toBe(400);
    await calendar(admin);
    expect(await audit(id)).toEqual([
      { action: "create", record: "Appointment" },
      { action: "update", record: "Appointment" },
      { action: "update", record: "Appointment status" },
    ]);
  });

  it("never reaches another clinic's appointment or patient", async () => {
    const id = await t.register();
    const a = await t.ok(book(slot(id, { startsAt: at("2030-01-18", "09:00") })), Appointment, 201);
    const ngiti = await t.as(NGITI_OWNER);
    for (const res of [await move(a.id, { dentistId: "ngiti_staff_lim", chairId: "ngiti_chair_1", startsAt: at("2030-01-18", "10:00"), durationMin: 30 }, ngiti), await status(a.id, { status: "confirmed" }, ngiti)]) {
      expect([res.status, res.text]).toEqual([404, "Appointment not found"]);
    }
    const res = await book({ ...slot(id), dentistId: "ngiti_staff_lim", chairId: "ngiti_chair_1" }, ngiti);
    expect([res.status, res.text]).toEqual([404, "Patient not found"]);
  });

  it("lets front desk book but not a parent", async () => {
    const id = await t.register();
    expect((await book(slot(id, { startsAt: at("2030-01-21", "09:00") }), await t.as(FRONT_DESK))).status).toBe(201);
    const guardianId = t.platform.tenants[DEMO_CLINIC_ID]!.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
    const parent = await t.as([DEMO_CLINIC_ID, `guardian.${guardianId}`]);
    const res = await book(slot("patient_sibling", { startsAt: at("2030-01-21", "10:00") }), parent);
    expect([res.status, res.text]).toEqual([403, "You don't have access to this"]); // own child or not: staff book
  });

  it("has a seeded schedule with no double-bookings", async () => {
    const seeded = new Set(t.platform.tenants[DEMO_CLINIC_ID]!.appointments.map((a) => a.id)); // not the cases' own
    for (const cookie of [admin, dasma(owner)]) {
      const list = (await calendar(cookie)).filter((a) => seeded.has(a.id));
      expect(list.length).toBeGreaterThan(0); // not vacuous (an open-ended calendar once answered [])
      list.forEach((a, i) => expect(findConflict(a, list.slice(0, i)), a.id).toBeUndefined());
    }
  });

  describe("parent messages (B9, handlers.test.ts → parent messages)", () => {
    const texts = (where: object) => inClinic(DEMO_CLINIC_ID, () => t.prisma.message.findMany({ where, orderBy: [{ kind: "asc" }, { sendAt: "asc" }] }));
    const outboxFor = async (ids: string[]) => (await t.prisma.outboxMessage.findMany({ where: { kind: "message.send" } })).filter((o) => ids.includes((o.payload as { messageId: string }).messageId));

    it("queues a confirmation and a reminder with the child's name when an appointment is booked", async () => {
      const id = await t.register();
      const appt = await t.ok(book(slot(id, { startsAt: at("2030-04-01", "09:00") })), Appointment, 201);
      const rows = await texts({ appointmentId: appt.id });
      expect(rows.map((m) => [m.kind, m.status, m.to, m.recipientName])).toEqual([
        ["appointment_confirmation", "queued", "09171234567", "Rosa Mendoza"],
        ["appointment_reminder", "queued", "09171234567", "Rosa Mendoza"],
      ]);
      for (const m of rows) expect(m.body).toContain("Bea");
      expect(rows[1]!.sendAt.toISOString()).toBe(reminderSendAt(appt.startsAt));
      expect(await outboxFor(rows.map((m) => m.id))).toHaveLength(2);
    });

    it("queues pre-treatment instructions for an extraction, and withdraws them on cancel", async () => {
      const id = await t.register();
      const appt = await t.ok(book(slot(id, { procedureCode: "extraction", startsAt: at("2030-04-02", "09:00") })), Appointment, 201);
      expect((await texts({ appointmentId: appt.id })).map((m) => m.kind)).toEqual(["appointment_confirmation", "appointment_reminder", "pre_treatment"]);
      await t.ok(status(appt.id, { status: "cancelled", cancelReason: "Moved abroad" }), Appointment);
      expect((await texts({ appointmentId: appt.id })).map((m) => m.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    });

    it("withdraws the old reminder on a move and queues the new time's, then a no-show queues the missed text", async () => {
      const id = await t.register();
      const appt = await t.ok(book(slot(id, { startsAt: at("2030-04-03", "09:00") })), Appointment, 201);
      const moved = await t.ok(move(appt.id, { dentistId: "staff_reyes", chairId: "chair_1", startsAt: at("2030-04-04", "10:00"), durationMin: 30 }), Appointment);
      const reminders = await texts({ appointmentId: appt.id, kind: "appointment_reminder" });
      expect(reminders.map((m) => [m.status, m.sendAt.toISOString()])).toEqual([
        ["cancelled", reminderSendAt(appt.startsAt)],
        ["queued", reminderSendAt(moved.startsAt)],
      ]);
      // Sorted: booked outside sending hours, both confirmations go at the same 8 AM, so their order is a tie (decision 17).
      expect((await texts({ appointmentId: appt.id, kind: "appointment_confirmation" })).map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);
      await t.ok(status(appt.id, { status: "no_show" }), Appointment);
      const after = await texts({ appointmentId: appt.id });
      expect(after.filter((m) => m.status === "queued").map((m) => m.kind)).toEqual(["missed_appointment"]);
    });

    it("saves a booking and its texts together, or neither (same transaction)", async () => {
      const id = await t.register();
      // The reminder's outbox row fails after the appointment and the confirmation were written.
      const enqueue = t.app.get(OutboxService).enqueue.bind(t.app.get(OutboxService));
      let n = 0;
      const spy = vi.spyOn(t.app.get(OutboxService), "enqueue").mockImplementation(async (...args) => (++n === 2 ? Promise.reject(new Error("outbox down")) : enqueue(...args)));
      try {
        expect((await book(slot(id, { startsAt: at("2030-04-08", "09:00") }))).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await rows({ patientId: id })).toBe(0);
      expect(await texts({ patientId: id })).toEqual([]);
    });

    it("queues nothing when a booking is refused", async () => {
      const [a, b] = [await t.register(), await t.register()];
      await t.ok(book(slot(a, { startsAt: at("2030-04-05", "09:00") })), Appointment, 201);
      const outboxBefore = await t.prisma.outboxMessage.count();
      expect((await book(slot(b, { startsAt: at("2030-04-05", "09:00") }))).status).toBe(409);
      expect(await texts({ patientId: b })).toEqual([]);
      expect(await t.prisma.outboxMessage.count()).toBe(outboxBefore);
    });
  });

  describe("under parallel requests (E1)", () => {
    it.each([0, 1, 2, 3, 4])("books one chair and slot exactly once (round %i, done-when)", async (round) => {
      const patients = await Promise.all(Array.from({ length: 10 }, () => t.register()));
      const startsAt = at(`2030-02-0${round + 4}`, "09:00"); // Mon 4 to Fri 8 February
      const results = await Promise.all(patients.map((p, i) => book(slot(p, { chairId: "chair_3", dentistId: i % 2 ? "staff_reyes" : "staff_delacruz", startsAt }))));
      expect(results.map((r) => r.status).sort()).toEqual([201, ...Array(9).fill(409)]);
      expect(await rows({ chairId: "chair_3", startsAt: new Date(startsAt), status: "booked" })).toBe(1);
    });

    it("books one dentist once at one time, whatever the chair", async () => {
      const patients = await Promise.all(Array.from({ length: 9 }, () => t.register()));
      const startsAt = at("2030-02-11", "10:00");
      const results = await Promise.all(patients.map((p, i) => book(slot(p, { chairId: `chair_${(i % 3) + 1}`, startsAt }))));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    });

    it("books one dentist once at one time, across branches", async () => {
      const [a, b] = [await t.register(), await t.register()];
      const startsAt = at("2030-02-12", "10:00");
      const results = await Promise.all([book(slot(a, { chairId: "chair_3", startsAt })), book(slot(b, { chairId: "chair_4", startsAt }), dasma(owner))]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])("lets only one of a booking and a move take a slot (round %i)", async (round) => {
      const [a, b] = [await t.register(), await t.register()];
      const hour = `${String(8 + round).padStart(2, "0")}:00`; // 8:00 to 17:00, one hour per round
      const target = at("2030-03-04", hour);
      const existing = await t.ok(book(slot(a, { chairId: "chair_2", dentistId: "staff_santos", startsAt: at("2030-03-05", hour) })), Appointment, 201);
      const [moved, booked] = await Promise.all([
        move(existing.id, { dentistId: "staff_santos", chairId: "chair_3", startsAt: target, durationMin: 30 }),
        book(slot(b, { chairId: "chair_3", dentistId: "staff_villanueva", startsAt: target })),
      ]);
      expect([moved.status, booked.status].filter((s) => s < 300)).toHaveLength(1);
    });

    it("keeps a row consistent when a cancel and a move race", async () => {
      for (let round = 0; round < 5; round++) {
        const id = await t.register();
        const a = await t.ok(book(slot(id, { chairId: "chair_2", dentistId: "staff_santos", startsAt: at("2030-03-11", `${10 + round}:00`) })), Appointment, 201);
        const results = await Promise.all([status(a.id, { status: "cancelled", cancelReason: "Sick" }), move(a.id, { dentistId: "staff_santos", chairId: "chair_2", startsAt: at("2030-03-12", `${10 + round}:00`), durationMin: 30 })]);
        for (const r of results) expect([200, 409]).toContain(r.status);
        const [stored] = await t.ok(t.call("get", `/patients/${id}/appointments`, admin), z.array(Appointment));
        expect(["cancelled", "booked"]).toContain(stored!.status);
      }
    });
  });
});
