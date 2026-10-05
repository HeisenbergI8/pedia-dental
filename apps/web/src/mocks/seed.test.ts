import { describe, expect, it } from "vitest";
import { differenceInYears, format, parseISO } from "date-fns";
import { findConflict, habitTimeline, matchesFilter, needsAttention, patientStanding } from "@pedia/shared";
import { seed } from "./seed";

const today = format(new Date(), "yyyy-MM-dd");
const db = seed();
const rows = db.patients.map((p) => ({ ...p, ...patientStanding(p.id, db, today) }));
const share = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length / rows.length;

describe("seed", () => {
  it("keeps the first patients exactly as before the roster (faker order unchanged)", () => {
    // Measured 2026-10-03 from seed() at 5a984a0. Changing seedPatient() changes these on purpose.
    expect(db.patients.slice(0, 3).map((p) => p.lastName)).toEqual(["Reynolds-Miller", "Johnson", "Lynch"]);
  });

  it("answers agree with the lists, and some patients were never asked", () => {
    expect(db.patients.filter((p) => p.noKnownAllergies === true).every((p) => p.allergies.length === 0)).toBe(true);
    expect(db.patients.filter((p) => p.allergies.length > 0).every((p) => p.noKnownAllergies !== true)).toBe(true);
    expect(db.patients.some((p) => p.noKnownAllergies === undefined)).toBe(true);
  });

  it("is the same on every load: same patients and the same labels", () => {
    const again = seed();
    expect(again.patients.map((p) => [p.id, p.firstName, p.lastName])).toEqual(db.patients.map((p) => [p.id, p.firstName, p.lastName]));
    expect(again.patients.map((p) => patientStanding(p.id, again, today).flags)).toEqual(rows.map((r) => r.flags));
  });

  it("has enough patients to page, and only children", () => {
    expect(db.patients).toHaveLength(61);
    expect(db.patients.every((p) => differenceInYears(new Date(), parseISO(p.birthDate)) < 18)).toBe(true);
  });

  it("flags a minority for each label, never everyone", () => {
    expect(share((r) => r.flags.recallDue)).toBeGreaterThan(0.15);
    expect(share((r) => r.flags.recallDue)).toBeLessThan(0.35);
    expect(share((r) => r.flags.balanceDue)).toBeGreaterThan(0.15);
    expect(share((r) => r.flags.balanceDue)).toBeLessThan(0.35);
    expect(share((r) => r.flags.noContact)).toBeGreaterThan(0);
    expect(share((r) => r.flags.noContact)).toBeLessThan(0.15);
    expect(share((r) => needsAttention(r.flags))).toBeLessThan(0.6);
    const recent = share((r) => matchesFilter("recent_visit", r, today));
    expect(recent).toBeGreaterThan(0.2);
    expect(recent).toBeLessThan(0.6);
  });

  it("has today's birthdays and pending requests to act on", () => {
    if (today.slice(5) !== "02-29") expect(db.patients.filter((p) => p.birthDate.slice(5) === today.slice(5))).toHaveLength(2);
    expect(db.appointmentRequests.filter((r) => r.status === "pending")).toHaveLength(2);
  });

  it("never double-books a chair or a dentist", () => {
    for (const a of db.appointments) expect(findConflict(a, db.appointments), a.id).toBeUndefined();
  });

  it("has growth examples: an explicit stop, an ongoing habit and an inferred stop", () => {
    const db = seed();
    expect(db.growth).toHaveLength(6);
    expect(db.growth.every((g) => db.visits.some((v) => v.id === g.visitId))).toBe(true);
    const third = db.growth.slice(4);
    expect(habitTimeline(third)[0]).toMatchObject({ habit: "mouth_breathing", stopInferred: true });
  });

  it("seeds 3-month recalls for high caries risk exams", () => {
    expect(seed().dueItems.some((i) => i.ruleId === "routine_high_risk")).toBe(true);
  });
});
