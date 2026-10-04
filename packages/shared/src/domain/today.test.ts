import { describe, expect, it } from "vitest";
import type { Appointment, AppointmentStatus } from "../schemas/appointment";
import { todaySummary, visitMix } from "./today";

const today = "2026-10-03"; // Saturday; the week starts Monday 2026-09-28
const at = (day: string, h = 10) => `${day}T${String(h - 8).padStart(2, "0")}:00:00.000Z`; // h o'clock in Manila
let n = 0;
const appt = (patientId: string, status: AppointmentStatus, startsAt = at(today)): Appointment => ({
  id: `a${++n}`, clinicId: "c", patientId, dentistId: "d1", chairId: "c1", startsAt, durationMin: 30, reason: "Oral examination", status,
});
const patients = [
  { id: "p1", firstName: "Ana", lastName: "Cruz", birthDate: "2020-10-03" },
  { id: "p2", firstName: "Ben", lastName: "Reyes", birthDate: "2018-01-15" },
];
const base = { patients, staff: [{ id: "d1", fullName: "Dr. Ana Reyes" }], appointmentRequests: [], visits: [], messages: [] };

describe("today at a glance", () => {
  it("counts every appointment today into exactly one group, cancelled included", () => {
    const statuses: AppointmentStatus[] = ["booked", "confirmed", "arrived", "in_chair", "done", "no_show", "cancelled"];
    const s = todaySummary({ ...base, appointments: [...statuses.map((st) => appt("p1", st)), appt("p2", "done", at("2026-10-02"))] }, today);
    expect(s.counts).toMatchObject({ total: 7, upcoming: 2, waiting: 1, inChair: 1, done: 1, missed: 2 });
    const { total, requests, ...groups } = s.counts;
    expect(Object.values(groups).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("lists today's appointments by time with names and the dentist", () => {
    const s = todaySummary({ ...base, appointments: [appt("p2", "booked", at(today, 14)), appt("p1", "arrived", at(today, 9))] }, today);
    expect(s.appointments.map((a) => [a.patientName, a.dentistName])).toEqual([["Cruz, Ana", "Dr. Ana Reyes"], ["Reyes, Ben", "Dr. Ana Reyes"]]);
  });

  it("counts pending requests only", () => {
    const s = todaySummary({ ...base, appointments: [], appointmentRequests: [{ status: "pending" }, { status: "handled" }] }, today);
    expect(s.counts.requests).toBe(1);
  });

  it("lists birthdays with their age and this year's greeting", () => {
    const greeted = { patientId: "p1", kind: "birthday" as const, createdAt: "2026-10-03T00:30:00.000Z", status: "queued" as const };
    const lastYear = { ...greeted, createdAt: "2025-10-03T00:30:00.000Z", status: "sent" as const };
    expect(todaySummary({ ...base, appointments: [], messages: [lastYear] }, today).birthdays).toEqual([
      { patientId: "p1", patientName: "Cruz, Ana", turning: 6, greeting: undefined },
    ]);
    expect(todaySummary({ ...base, appointments: [], messages: [lastYear, greeted] }, today).birthdays[0]!.greeting).toBe("queued");
  });
});

describe("visit mix", () => {
  it("splits each day of this week into first-ever and returning visits, once per child", () => {
    const appointments = [
      appt("p1", "done", at("2026-09-28")), // Monday: p1's first visit ever
      appt("p1", "done", at("2026-10-01")), // Thursday: p1 again
      appt("p2", "done", at("2026-10-01", 9)), appt("p2", "done", at("2026-10-01", 15)), // Thursday twice: counted once
      appt("p2", "no_show", at("2026-09-29")), // not a visit
    ];
    const visits = [{ patientId: "p2", status: "completed" as const, date: "2026-03-01" }]; // p2 seen before
    const mix = visitMix({ patients, visits, appointments }, today);
    expect(mix.map((d) => d.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(mix[0]).toMatchObject({ new: 1, returning: 0 });
    expect(mix[1]).toMatchObject({ new: 0, returning: 0 });
    expect(mix[3]).toMatchObject({ new: 0, returning: 2 });
    expect(mix[6]).toMatchObject({ new: 0, returning: 0 }); // after today
  });
});
