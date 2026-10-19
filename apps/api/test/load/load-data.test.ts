import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { Appointment, Invoice, Patient, Payment, Visit } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { loadPlatform } from "./load-data";

const TODAY = new Date("2026-10-18T04:00:00Z");

describe("the load test's data (B13c1 E9)", () => {
  const base = seedPlatform();
  const big = loadPlatform(30, TODAY);
  const db = big.tenants[DEMO_CLINIC_ID]!;
  const added = <T extends { id: string }>(rows: T[]) => rows.filter((r) => r.id.startsWith("load_"));

  it("adds patients to Bulilit only", () => {
    expect(db.patients.length - base.tenants[DEMO_CLINIC_ID]!.patients.length).toBe(30);
    for (const id of Object.keys(base.tenants).filter((id) => id !== DEMO_CLINIC_ID)) {
      expect(big.tenants[id]!.patients.length).toBe(base.tenants[id]!.patients.length);
    }
  });

  it("builds every new record as its contract type", () => {
    for (const p of added(db.patients)) Patient.parse(p);
    for (const v of added(db.visits)) Visit.parse(v);
    for (const a of added(db.appointments)) Appointment.parse(a);
    for (const i of added(db.invoices)) Invoice.parse(i);
    for (const p of added(db.payments)) Payment.parse(p);
    expect([added(db.visits).length, added(db.invoices).length, added(db.payments).length]).toEqual([60, 30, 20]);
  });

  it("keeps ids and receipt numbers unique, chairs at their branch, and nothing on today", () => {
    for (const rows of [db.patients, db.visits, db.appointments, db.invoices, db.payments] as { id: string }[][]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
    expect(new Set(db.payments.map((p) => p.receiptNo)).size).toBe(db.payments.length);
    const branchOf = new Map(db.chairs.map((c) => [c.id, c.branchId]));
    expect(added(db.appointments).filter((a) => branchOf.get(a.chairId) !== a.branchId)).toEqual([]);
    expect(added(db.appointments).filter((a) => a.startsAt.slice(0, 10) >= TODAY.toISOString().slice(0, 10))).toEqual([]);
  });

  it("is deterministic", () => {
    const names = (p: ReturnType<typeof loadPlatform>) => added(p.tenants[DEMO_CLINIC_ID]!.patients).map((x) => `${x.firstName} ${x.lastName}`);
    expect(names(loadPlatform(30, TODAY))).toEqual(names(big));
  });
});
