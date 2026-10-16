import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment, AppointmentRequest, Patient, type RegisterPatientInput } from "@pedia/shared";
import { addDays, format } from "date-fns";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PatientsService } from "../../src/patients/patients.service";
import { inClinic } from "./support/database";
import { FRONT_DESK, NGITI_OWNER, clinicalApp } from "./clinical-support";

/** apps/web's request and parent-confirm handler tests (handlers.test.ts:1354–1379), against the API (CHUNKS B7). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let desk = "";
let parent = "";
let guardianId = "";
beforeAll(async () => {
  t = await clinicalApp();
  desk = await t.as(FRONT_DESK);
  guardianId = t.platform.tenants[DEMO_CLINIC_ID]!.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
  parent = await t.as([DEMO_CLINIC_ID, `guardian.${guardianId}`]);
}, 60_000);
afterAll(() => t.app.close());

const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd"); // Manila: the process is pinned (E3)
const body = (over: object = {}) => ({ preferredDate: day(3), timeOfDay: "morning", reason: "Check-up", ...over });
const ask = (patientId: string, cookie = parent, b: unknown = body()) => t.call("post", `/patients/${patientId}/appointment-requests`, cookie, b);
const inbox = async (query = "") => t.ok(t.call("get", `/appointment-requests${query}`, desk), z.array(AppointmentRequest));
const handled = (id: string, cookie = desk) => t.call("post", `/appointment-requests/${id}/handled`, cookie);
/** A new child of this guardian list, registered by the front desk. */
let n = 0;
const child = async (guardians: RegisterPatientInput["guardians"]) => {
  const input = {
    firstName: "Lia", lastName: `Request${++n}`, birthDate: "2021-03-04", sex: "female", address: "", guardians,
    emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: guardians[0]!.id, photos: true, reminders: true, confirmed: true },
  } as RegisterPatientInput;
  return (await t.ok(t.call("post", "/patients", desk, input), Patient, 201)).id;
};
const theirChild = () => child([{ id: guardianId, fullName: "Same Parent", relationship: "Mother", phone: "09171234567", isPrimary: true }]);

describe("appointment requests (apps/web handlers.test.ts → requests)", () => {
  it("takes one request per child from its parent and puts it in the front desk's inbox", async () => {
    const request = await t.ok(ask("patient_sibling"), AppointmentRequest, 201);
    expect(request).toMatchObject({ status: "pending", guardianId, patientId: "patient_sibling", preferredDate: day(3) });
    const again = await ask("patient_sibling");
    expect([again.status, again.text]).toEqual([409, "You already have a request waiting. The clinic will call you to book it."]);
    const other = t.platform.tenants[DEMO_CLINIC_ID]!.patients.find((p) => !p.guardians.some((g) => g.id === guardianId))!;
    const theirs = await ask(other.id);
    expect([theirs.status, theirs.text]).toEqual([403, "This isn't one of your children's records"]);

    expect((await inbox("?status=pending")).map((r) => r.id)).toContain(request.id);
    expect((await t.ok(handled(request.id), AppointmentRequest)).status).toBe("handled");
    expect((await t.ok(handled(request.id), AppointmentRequest)).status).toBe("handled"); // again: 200, as the mock
    expect((await inbox("?status=pending")).map((r) => r.id)).not.toContain(request.id);
    await t.ok(ask("patient_sibling", parent, body({ preferredDate: day(5) })), AppointmentRequest, 201); // handled frees the child
  });

  it("checks in the mock's order: the body, then the date, then the pending one", async () => {
    const id = await theirChild();
    // Only a parent may ask (PARENT_ONLY), and the guard refuses them any id that isn't their child's, so the
    // service's 404 is a guard 403 over HTTP; staff can't ask at all.
    expect((await ask("patient_nobody")).status).toBe(403);
    expect((await ask(id, desk)).status).toBe(403);
    const bad = await ask(id, parent, { timeOfDay: "noon" });
    expect(bad.status).toBe(400);
    const yesterday = await ask(id, parent, body({ preferredDate: day(-1) }));
    expect([yesterday.status, yesterday.text]).toEqual([400, "Pick today or a later date"]);
    await t.ok(ask(id, parent, body({ preferredDate: day(0) })), AppointmentRequest, 201); // today passes
    const both = await ask(id, parent, body({ preferredDate: day(-1) })); // yesterday while one is pending: 400 before 409
    expect([both.status, both.text]).toEqual([400, "Pick today or a later date"]);
    expect((await ask(id)).status).toBe(409);
  });

  it("names the primary guardian, not the first listed, when no parent is signed in", async () => {
    const service = t.app.get(PatientsService);
    const g = (id: string, isPrimary: boolean) => ({ id, fullName: `G ${id}`, relationship: "Aunt", phone: "09171234568", isPrimary });
    const primarySecond = await child([g("g_first", false), g("g_primary", true)]);
    expect(await inClinic(DEMO_CLINIC_ID, () => service.primaryGuardianId(t.prisma, primarySecond))).toBe("g_primary");
  });

  it("lists the inbox newest first, narrowed only by a status that parses, and audits a child's list", async () => {
    const seeded = (await inbox()).filter((r) => r.id.startsWith("request_roster_"));
    expect(seeded.map((r) => r.id)).toEqual(["request_roster_15", "request_roster_9", "request_roster_3"]);
    expect((await inbox("?status=pending")).filter((r) => r.id.startsWith("request_roster_")).map((r) => r.id)).toEqual(["request_roster_9", "request_roster_3"]);
    expect((await inbox("?status=nonsense")).length).toBe((await inbox()).length);

    const patientId = seeded[2]!.patientId;
    const before = (await t.auditOf(patientId, "Appointment requests")).length;
    const mine = await t.ok(t.call("get", `/patients/${patientId}/appointment-requests`, desk), z.array(AppointmentRequest));
    expect(mine.map((r) => r.id)).toEqual(["request_roster_3"]);
    expect(await t.auditOf(patientId, "Appointment requests")).toHaveLength(before + 1);
  });

  it("takes exactly one of ten parallel requests for one child", async () => {
    const id = await theirChild();
    const answers = await Promise.all(Array.from({ length: 10 }, () => ask(id)));
    expect(answers.map((r) => r.status).sort()).toEqual([201, ...Array<number>(9).fill(409)]);
    expect(await inClinic(DEMO_CLINIC_ID, () => t.prisma.appointmentRequest.count({ where: { patientId: id } }))).toBe(1);
  });

  it("answers 404 for an unknown request and for another clinic's", async () => {
    for (const [id, cookie] of [["request_nobody", desk], ["request_roster_3", await t.as(NGITI_OWNER)]] as const) {
      const res = await handled(id, cookie);
      expect([res.status, res.text]).toEqual([404, "Request not found"]);
    }
  });

  it("audits a request and its handling, and nothing for a refusal", async () => {
    const id = await theirChild();
    const r = await t.ok(ask(id), AppointmentRequest, 201);
    await ask(id); // 409
    await ask(id, parent, body({ preferredDate: day(-2) })); // 400
    await t.ok(handled(r.id), AppointmentRequest);
    expect((await t.auditOf(id, "Appointment request")).map((e) => e.action)).toEqual(["create", "update"]);
  });
});

describe("a parent confirming their child's appointment (decision 2)", () => {
  const status = (id: string, b: object, cookie = parent) => t.call("post", `/appointments/${id}/status`, cookie, b);

  it("confirms their own child's, but can't cancel it or touch another family's", async () => {
    const cancel = await status("appointment_sibling", { status: "cancelled", cancelReason: "Busy" });
    expect([cancel.status, cancel.text]).toEqual([403, "You can confirm this appointment. To change it, call the clinic."]);
    expect((await t.ok(status("appointment_sibling", { status: "confirmed" }), Appointment)).status).toBe("confirmed");
    const mine = new Set(t.platform.tenants[DEMO_CLINIC_ID]!.patients.filter((p) => p.guardians.some((g) => g.id === guardianId)).map((p) => p.id));
    const theirs = t.platform.tenants[DEMO_CLINIC_ID]!.appointments.find((a) => !mine.has(a.patientId) && a.status === "booked")!;
    const other = await status(theirs.id, { status: "confirmed" });
    expect([other.status, other.text]).toEqual([403, "This isn't one of your children's records"]);
    const unknown = await status("appointment_nobody", { status: "confirmed" });
    expect([unknown.status, unknown.text]).toEqual([403, "This isn't one of your children's records"]);
    expect((await t.ok(status(theirs.id, { status: "confirmed" }, desk), Appointment)).status).toBe("confirmed"); // staff unaffected
  });
});
