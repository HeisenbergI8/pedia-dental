import { seedPlatform } from "@pedia/seed";
import { Appointment } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { appointmentData, byStartThenChair, toAppointment, type AppointmentRow } from "./appointment.rows";

const appointments = Object.values(seedPlatform().tenants).flatMap((t) => t.appointments);
const back = (a: Appointment) => toAppointment(appointmentData(a) as AppointmentRow);

describe("appointment rows", () => {
  it("stores every seeded appointment so that toAppointment reads back the same one", () => {
    expect(appointments.length).toBeGreaterThan(0);
    for (const a of appointments) expect(Appointment.parse(back(a))).toEqual(a);
  });

  it("leaves absent optional fields absent, and keeps a cancel reason", () => {
    const { procedureCode: _p, sourceRuleId: _s, cancelReason: _c, ...a } = appointments[0]!;
    expect(Object.keys(back(a)).sort()).toEqual(Object.keys(a).sort());
    expect(back({ ...a, status: "cancelled", cancelReason: "Sick" }).cancelReason).toBe("Sick");
  });

  it("orders by start, then chair position, then id", () => {
    const at = (id: string, startsAt: string, chairId: string) => ({ ...appointments[0]!, id, startsAt, chairId });
    const chairs = new Map([["chair_1", 0], ["chair_2", 1]]);
    const list = [at("b", "2030-01-07T01:00:00.000Z", "chair_2"), at("a", "2030-01-07T01:00:00.000Z", "chair_1"), at("c", "2030-01-07T00:30:00.000Z", "chair_2")];
    expect(list.sort(byStartThenChair(chairs)).map((x) => x.id)).toEqual(["c", "a", "b"]);
    const tie = [at("z", "2030-01-07T01:00:00.000Z", "chair_1"), at("y", "2030-01-07T01:00:00.000Z", "chair_1")];
    expect(tie.sort(byStartThenChair(chairs)).map((x) => x.id)).toEqual(["y", "z"]);
  });
});
