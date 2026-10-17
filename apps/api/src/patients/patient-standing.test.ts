import { PatientFilter, PatientListQuery, type Appointment, type DueItem, type Message } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import type { VisitFacts } from "../visits/visit-days.service";
import type { BillTotalsOf } from "../billing-records/billing-records.service";
import { standingPage, type Named } from "./patient-standing";

const TODAY = "2026-10-16";
const query = (q: object = {}) => PatientListQuery.parse(q);
const kid = (id: string, lastName = "Cruz", firstName = "Ana"): Named => ({ id, firstName, lastName });
const visit = (patientId: string, date: string): VisitFacts["visits"][number] => ({ patientId, status: "completed", date });
const done = (patientId: string, day: string, status: Appointment["status"] = "done"): Appointment => ({
  id: `a_${patientId}_${day}`, clinicId: "c", branchId: "b", patientId, dentistId: "d", chairId: "ch",
  startsAt: new Date(`${day}T09:00:00+08:00`).toISOString(), durationMin: 30, reason: "Check-up", status,
});
const due = (patientId: string, dueOn: string): DueItem => ({
  id: `due_${patientId}_${dueOn}`, clinicId: "c", patientId, ruleId: "routine", kind: "recall", procedure: "oral_exam", dueOn,
  sourceNoteId: "n", createdAt: "2026-04-01T00:00:00.000Z",
});
const NO_BILLS = { invoices: [], payments: [] };
type Tried = Pick<Message, "patientId" | "status" | "sendAt">;
const page = (matched: Named[], facts: Partial<VisitFacts>, items: DueItem[] = [], q: object = {}, money = false, bills: BillTotalsOf = NO_BILLS, tried: Tried[] = []) =>
  standingPage(matched, { visits: [], done: [], ...facts }, items, bills, tried, query(q), TODAY, money);

describe("standingPage (patients/mocks.ts:114–151)", () => {
  it("flags no contact when the last tried text failed, and needs attention for it; a later sent one clears it", () => {
    const failed: Tried = { patientId: "p1", status: "failed", sendAt: "2026-10-10T01:00:00.000Z" };
    const res = page([kid("p1"), kid("p2")], {}, [], {}, false, NO_BILLS, [failed]);
    expect(res.rows.map((r) => [r.id, r.flags.noContact])).toEqual([["p1", true], ["p2", false]]);
    expect(res.counts.needs_attention).toBe(1);
    const sent: Tried = { patientId: "p1", status: "sent", sendAt: "2026-10-12T01:00:00.000Z" };
    expect(page([kid("p1")], {}, [], {}, false, NO_BILLS, [failed, sent]).rows[0]!.flags.noContact).toBe(false);
    expect(page([kid("p1")], {}, [], {}, false, NO_BILLS, [{ ...sent, sendAt: failed.sendAt }, failed]).rows[0]!.flags.noContact).toBe(false); // a tie: reached
  });

  it("flags a recall overdue or due this week, not one due this month", () => {
    const res = page([kid("p1"), kid("p2"), kid("p3")], {}, [due("p1", "2026-10-13"), due("p2", "2026-10-21"), due("p3", "2026-11-05")]);
    expect(res.rows.map((r) => [r.id, r.recallDueOn, r.flags.recallDue])).toEqual([["p1", "2026-10-13", true], ["p2", "2026-10-21", true], ["p3", undefined, false]]);
    expect([res.counts.recall_due, res.counts.needs_attention]).toEqual([2, 2]);
    expect(page([kid("p1")], {}, [due("p1", "2026-10-13"), due("p1", "2026-10-10")]).rows[0]!.recallDueOn).toBe("2026-10-10"); // the earliest
  });

  it("counts a visit within 30 days as recent, a done appointment as a visit, and not a cancelled one", () => {
    const res = page([kid("p1"), kid("p2"), kid("p3"), kid("p4")], {
      visits: [visit("p1", "2026-09-17"), visit("p2", "2026-09-16")], // 29 and 30 days ago
      done: [done("p3", "2026-10-01"), done("p4", "2026-10-02", "cancelled")],
    }, [], { filter: "recent_visit" });
    expect(res.rows.map((r) => r.id)).toEqual(["p1", "p3"]);
    expect(res.total).toBe(2);
  });

  it("sorts by last visit, most recent first, never-seen last, ties by name then id, stable across pages", () => {
    const matched = [kid("p1", "Bautista"), kid("p2", "Abad"), kid("p3", "Abad"), kid("p4", "Cruz"), kid("p5", "Dela Paz")];
    const facts = { visits: [visit("p1", "2026-10-01"), visit("p2", "2026-09-01"), visit("p3", "2026-09-01")], done: [done("p4", "2026-10-05")] };
    const first = page(matched, facts, [], { sort: "last_visit", pageSize: 3 });
    const second = page(matched, facts, [], { sort: "last_visit", pageSize: 3, page: 2 });
    expect([...first.rows, ...second.rows].map((r) => r.id)).toEqual(["p4", "p1", "p2", "p3", "p5"]);
    expect(page(matched, facts, [], { sort: "last_visit", pageSize: 3, page: 99 }).page).toBe(2); // clamped
  });

  it("falls back to name order for a balance sort without billing.view, and ties on name with it", () => {
    const matched = [kid("p1", "Cruz"), kid("p2", "Abad")];
    expect(page(matched, {}, [], { sort: "balance" }).rows.map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(page(matched, {}, [], { sort: "balance" }, true).rows.map((r) => r.id)).toEqual(["p2", "p1"]); // no bills here: every balance is 0, so name order
  });

  it("counts each chip as its filter's rows, and totals the filtered rows", () => {
    const matched = [kid("p1"), kid("p2"), kid("p3")];
    const facts = { visits: [visit("p1", "2026-10-10")] };
    const items = [due("p2", "2026-10-14")];
    const counts = page(matched, facts, items).counts;
    for (const f of PatientFilter.options) {
      const res = page(matched, facts, items, { filter: f });
      expect([f, counts[f]]).toEqual([f, res.total]);
    }
    expect(counts).toEqual({ all: 3, needs_attention: 1, balance_due: 0, recall_due: 1, recent_visit: 1 });
  });

  it("flags a balance due from live bills, counts it, and sorts by it only with billing.view (B8)", () => {
    const bills: BillTotalsOf = {
      invoices: [
        { id: "b1", patientId: "p1", discount: 0, lines: [{ amount: 50000 }] },
        { id: "b2", patientId: "p2", discount: 0, lines: [{ amount: 30000 }] },
      ],
      payments: [{ invoiceId: "b2", amount: 30000 }],
    };
    const matched = [kid("p2", "Abad"), kid("p1", "Cruz")];
    const res = page(matched, {}, [], { sort: "balance" }, true, bills);
    expect(res.rows.map((r) => [r.id, r.balance, r.flags.balanceDue])).toEqual([["p1", 50000, true], ["p2", 0, false]]);
    expect([res.counts.balance_due, res.counts.needs_attention]).toEqual([1, 1]);
    expect(page(matched, {}, [], { sort: "balance" }, false, bills).rows.map((r) => r.id)).toEqual(["p2", "p1"]); // the leak guard
  });
});
