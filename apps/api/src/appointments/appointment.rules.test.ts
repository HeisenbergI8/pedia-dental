import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import type { Appointment, ChangeAppointmentStatusInput } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { moveRefusal, requestRefusal, slotRefusal, statusRefusal, type SlotRefs } from "./appointment.rules";

const db = seedPlatform().tenants[DEMO_CLINIC_ID]!;
// Mon 2030-01-07 is a weekday far from the seeded fortnight; 01:00Z is 9:00 in Manila (the process is pinned, E3).
const nine = "2030-01-07T01:00:00.000Z";
const slot = (over: Partial<Appointment> = {}): Appointment => ({
  id: "new", clinicId: DEMO_CLINIC_ID, branchId: "branch_imus", patientId: "p", dentistId: "staff_reyes", chairId: "chair_1",
  startsAt: nine, durationMin: 30, reason: "Check-up", status: "booked", ...over,
});
const refs = (existing: Appointment[] = [], over: Partial<SlotRefs> = {}): SlotRefs => ({
  staff: db.staff, branches: db.branches, chairs: db.chairs, existing, ...over,
});

describe("slotRefusal (appointments/mocks.ts rejectSlot)", () => {
  it("needs a dentist who works at a branch taking bookings, in one of its chairs", () => {
    expect(slotRefusal(slot({ dentistId: "staff_cruz" }), refs())).toEqual({ status: 400, message: "Unknown dentist" });
    expect(slotRefusal(slot({ dentistId: "staff_delacruz" }), refs())).toBeUndefined(); // a dentist by a second role
    const archived = db.branches.map((b) => (b.id === "branch_imus" ? { ...b, archived: true } : b));
    expect(slotRefusal(slot(), refs([], { branches: archived }))).toEqual({ status: 400, message: "This branch isn't taking bookings" });
    expect(slotRefusal(slot({ dentistId: "staff_santos", branchId: "branch_dasma", chairId: "chair_4" }), refs())).toEqual({
      status: 400, message: "Dr. Miguel Santos doesn't work at this branch",
    });
    const gone = db.staff.map((s) => (s.id === "staff_reyes" ? { ...s, deactivatedAt: "2026-01-01T00:00:00.000Z" } : s));
    expect(slotRefusal(slot(), refs([], { staff: gone }))?.message).toBe("Dr. Ana Reyes doesn't work at this branch");
    expect(slotRefusal(slot({ chairId: "chair_4" }), refs())).toEqual({ status: 400, message: "Choose a chair at this branch" });
  });

  it("keeps to the branch's hours and days", () => {
    expect(slotRefusal(slot({ startsAt: "2030-01-06T01:00:00.000Z" }), refs())?.message).toBe("The clinic is closed on Sundays. Pick another day.");
    expect(slotRefusal(slot({ startsAt: "2030-01-14T23:15:00.000Z" }), refs())?.message).toBe("Book between 8:00 AM and 6:00 PM.");
    expect(slotRefusal(slot({ startsAt: "2030-01-07T09:45:00.000Z" }), refs())?.message).toBe("Book between 8:00 AM and 6:00 PM.");
  });

  it("refuses a taken chair or a busy dentist anywhere, and nothing else", () => {
    const booked = slot({ id: "a1" });
    const at915 = "2030-01-07T01:15:00.000Z";
    expect(slotRefusal(slot({ startsAt: at915, dentistId: "staff_villanueva" }), refs([booked]))).toEqual({ status: 409, message: "Chair 1 is already booked at 9:00 AM" });
    expect(slotRefusal(slot({ startsAt: at915, chairId: "chair_2" }), refs([booked]))).toEqual({ status: 409, message: "Dr. Ana Reyes is already booked at 9:00 AM" });
    const atDasma = slot({ id: "a2", branchId: "branch_dasma", chairId: "chair_4" });
    expect(slotRefusal(slot({ chairId: "chair_2" }), refs([atDasma]))?.status).toBe(409); // the dentist at the other branch
    for (const status of ["cancelled", "no_show"] as const) expect(slotRefusal(slot(), refs([{ ...booked, status }]))).toBeUndefined();
    expect(slotRefusal(slot({ id: "a1" }), refs([booked]))).toBeUndefined(); // a move doesn't clash with itself
    expect(slotRefusal(slot({ startsAt: "2030-01-07T01:30:00.000Z" }), refs([booked]))).toBeUndefined(); // back to back
  });
});

describe("the handlers' own refusals", () => {
  it("moves only booked or confirmed appointments", () => {
    for (const s of ["booked", "confirmed"] as const) expect(moveRefusal(s)).toBeUndefined();
    for (const s of ["arrived", "in_chair", "done", "no_show", "cancelled"] as const) {
      expect(moveRefusal(s)).toEqual({ status: 409, message: "Only booked or confirmed appointments can be moved" });
    }
  });

  it("lets a confirm-only caller confirm, and checks the transition after the 403", () => {
    const to = (status: ChangeAppointmentStatusInput["status"]) => ({ status, ...(status === "cancelled" && { cancelReason: "Sick" }) }) as ChangeAppointmentStatusInput;
    expect(statusRefusal("booked", to("confirmed"), false)).toBeUndefined();
    for (const s of ["arrived", "cancelled", "no_show"] as const) {
      expect(statusRefusal("booked", to(s), false)).toEqual({ status: 403, message: "You can confirm this appointment. To change it, call the clinic." });
    }
    expect(statusRefusal("done", to("confirmed"), true)).toEqual({ status: 409, message: "Can't go from done to confirmed" });
    expect(statusRefusal("done", to("cancelled"), false)?.status).toBe(403); // 403 before 409
  });

  it("asks for today or later, and one waiting request per child", () => {
    expect(requestRefusal("2026-10-15", "2026-10-16", false)).toEqual({ status: 400, message: "Pick today or a later date" });
    expect(requestRefusal("2026-10-16", "2026-10-16", false)).toBeUndefined();
    expect(requestRefusal("2026-10-20", "2026-10-16", true)).toEqual({ status: 409, message: "You already have a request waiting. The clinic will call you to book it." });
    expect(requestRefusal("2026-10-15", "2026-10-16", true)?.status).toBe(400); // 400 before 409
  });
});
