import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment } from "@pedia/shared";
import type request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, clinicalApp } from "./clinical-support";

/** B9's races: a reminders "no" never leaves a text waiting for that family, and a move or cancel never doubles one (E8). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
let desk = "";
beforeAll(async () => {
  t = await clinicalApp();
  [admin, desk] = [await t.as(ADMIN), await t.as(FRONT_DESK)];
}, 60_000);
afterAll(() => t.app.close());

// Weekdays in May 2030, far from the seed and from the other int files; Manila times.
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+08:00`).toISOString();
const slot = (patientId: string, startsAt: string, chairId = "chair_1") => ({ patientId, dentistId: "staff_reyes", chairId, startsAt, durationMin: 30, reason: "Check-up" });
const book = async (body: object) => t.ok(t.call("post", "/appointments", admin, body), Appointment, 201);
const move = (id: string, startsAt: string) => t.call("put", `/appointments/${id}`, admin, { dentistId: "staff_reyes", chairId: "chair_1", startsAt, durationMin: 30, reason: "Check-up" });
const sayNo = (patientId: string) => t.call("post", `/patients/${patientId}/privacy-choices`, desk, { reminders: false });
const noServerErrors = (rs: request.Response[]) => expect(rs.filter((r) => r.status >= 500).map((r) => r.text)).toEqual([]);
const waiting = (where: object) => inClinic(DEMO_CLINIC_ID, () => t.prisma.message.findMany({ where: { ...where, status: "queued", dispatchedAt: null }, select: { kind: true } }));

describe("parent messages under parallel requests (B9)", () => {
  it.each([0, 1, 2])('leaves nothing waiting when a reminders "no" races 10 moves (round %i)', async (round) => {
    const id = await t.register();
    const day = `2030-05-0${round + 6}`;
    const appt = await book(slot(id, at(day, "09:00")));
    const results = await Promise.all([
      ...Array.from({ length: 10 }, (_, n) => move(appt.id, at(day, n % 2 ? "09:00" : "10:00"))),
      sayNo(id),
    ]);
    noServerErrors(results);
    expect(await waiting({ patientId: id })).toEqual([]);
  });

  it('leaves nothing waiting when a reminders "no" races 10 bookings', async () => {
    const id = await t.register();
    const results = await Promise.all([
      ...Array.from({ length: 10 }, (_, n) => t.call("post", "/appointments", admin, slot(id, at("2030-05-13", `${String(8 + n).padStart(2, "0")}:00`)))),
      sayNo(id),
    ]);
    noServerErrors(results);
    expect(results.filter((r) => r.status === 201).length).toBeGreaterThan(0);
    expect(await waiting({ patientId: id })).toEqual([]);
  });

  it("makes a move wait for the child's lock, so it reads a reminders \"no\" committed meanwhile", async () => {
    // The races above rarely land in the window; this pins it: hold the child's row as a reminders "no" does.
    const id = await t.register();
    const appt = await book(slot(id, at("2030-05-20", "09:00")));
    let release!: () => void;
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const no = t.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Patient WHERE clinicId = ${DEMO_CLINIC_ID} AND id = ${id} FOR UPDATE`;
        locked();
        await new Promise<void>((resolve) => (release = resolve));
      },
      { timeout: 30_000 },
    );
    await lockTaken;
    let moved = false;
    const moving = move(appt.id, at("2030-05-20", "10:00")).then((r) => ((moved = true), r));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(moved).toBe(false); // waiting on the child's lock (account → patient → appointment)
    release();
    await no;
    expect((await moving).status).toBe(200);
  });

  it("keeps one reminder and one confirmation waiting after parallel moves of one appointment", async () => {
    const id = await t.register();
    const appt = await book(slot(id, at("2030-05-14", "09:00")));
    const results = await Promise.all(Array.from({ length: 5 }, (_, n) => move(appt.id, at("2030-05-14", `${String(10 + n).padStart(2, "0")}:00`))));
    noServerErrors(results);
    expect((await waiting({ appointmentId: appt.id })).map((m) => m.kind).sort()).toEqual(["appointment_confirmation", "appointment_reminder"]);
  });

  it("withdraws an appointment's texts once when 10 cancels race", async () => {
    const id = await t.register();
    const appt = await book(slot(id, at("2030-05-15", "09:00")));
    const results = await Promise.all(Array.from({ length: 10 }, () => t.call("post", `/appointments/${appt.id}/status`, admin, { status: "cancelled", cancelReason: "Family travel" })));
    noServerErrors(results);
    expect(results.map((r) => r.status).sort()).toEqual([200, ...Array(9).fill(409)]);
    const texts = await inClinic(DEMO_CLINIC_ID, () => t.prisma.message.findMany({ where: { appointmentId: appt.id }, select: { status: true } }));
    expect(texts.map((m) => m.status)).toEqual(["cancelled", "cancelled"]);
  });
});
