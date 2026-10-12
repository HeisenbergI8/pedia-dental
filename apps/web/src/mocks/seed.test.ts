import { describe, expect, it } from "vitest";
import { differenceInYears, format, parseISO } from "date-fns";
import {
  TIER_LIMITS,
  accountUsage,
  brandColorProblem,
  canAddUnder,
  findConflict,
  habitTimeline,
  matchesFilter,
  needsAttention,
  patientStanding,
} from "@pedia/shared";
import { seedPlatform } from "./db";
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

describe("platform seed", () => {
  const platform = seedPlatform();
  const tenants = Object.entries(platform.tenants);

  it("has the demo clinic and a second, Small-tier account, each with its own store", () => {
    expect(platform.accounts.map((a) => [a.id, a.tier, a.status])).toEqual([
      ["clinic_demo", "mid", "active"],
      ["clinic_ngiti", "small", "active"],
    ]);
    expect(tenants.map(([id]) => id)).toEqual(platform.accounts.map((a) => a.id));
  });

  it("stamps every record with its own account, and every branch-level record with one of that account's branches", () => {
    for (const [clinicId, t] of tenants) {
      const branchIds = new Set(t.branches.map((b) => b.id));
      for (const rows of [t.patients, t.staff, t.visits, t.appointments, t.chairs, t.invoices, t.payments, t.messages]) {
        expect(rows.every((r) => r.clinicId === clinicId), clinicId).toBe(true);
      }
      for (const rows of [t.appointments, t.chairs, t.invoices, t.payments]) {
        expect(rows.every((r) => branchIds.has(r.branchId)), clinicId).toBe(true);
      }
      // An appointment's chair is at the appointment's branch.
      expect(t.appointments.every((a) => t.chairs.find((c) => c.id === a.chairId)?.branchId === a.branchId), clinicId).toBe(true);
    }
  });

  it("never shares a patient or staff id between accounts", () => {
    const [demo, ngiti] = tenants.map(([, t]) => new Set([...t.patients, ...t.staff].map((r) => r.id)));
    expect([...demo!].filter((id) => ngiti!.has(id))).toEqual([]);
  });

  it("keeps Dasmariñas billing-free, so the Imus finance figures are unchanged", () => {
    const demo = platform.tenants.clinic_demo!;
    expect(demo.appointments.some((a) => a.branchId === "branch_dasma")).toBe(true);
    expect([...demo.invoices, ...demo.payments].every((r) => r.branchId === "branch_imus")).toBe(true);
  });
});

describe("demo accounts' branding and limits (chunk 20)", () => {
  const p = seedPlatform();
  it("gives each account its own passing colour and its own logo", () => {
    const [demo, ngiti] = p.accounts;
    expect(demo!.brandColor).not.toBe(ngiti!.brandColor);
    expect(demo!.logoRef).not.toBe(ngiti!.logoRef);
    for (const a of p.accounts) {
      expect(brandColorProblem(a.brandColor), a.name).toBeUndefined();
      expect(a.logoRef, a.name).toMatch(/^demo\/.+\.svg$/);
    }
  });
  it("puts Ngiti (Small) exactly at its limits, so the next branch or login is refused", () => {
    const ngiti = p.tenants.clinic_ngiti!;
    expect(accountUsage(ngiti)).toEqual({ branches: 1, staffLogins: TIER_LIMITS.small.staffLogins });
    expect(canAddUnder("small", "staffLogins", accountUsage(ngiti).staffLogins)).toBe(false);
    expect(Object.values(p.tenants).every((t) => t.staffCredentials.length === 0)).toBe(true);
  });
});
