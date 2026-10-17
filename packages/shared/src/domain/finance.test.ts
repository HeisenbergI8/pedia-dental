import { describe, expect, it } from "vitest";
import type { Appointment } from "../schemas/appointment";
import type { Invoice, Payment } from "../schemas/billing";
import { financeFacts, financeSummary, financeWindow, summarizeFinance } from "./finance";
import { pesos } from "./money";

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString();
const base = { clinicId: "c", branchId: "b", receiptNo: "AR-000001", receivedBy: "staff_cruz" };
const invoices: Invoice[] = [
  { id: "A", clinicId: "c", branchId: "b", patientId: "p1", appointmentId: "a1", issuedAt: local(10, 1), discount: pesos(100), lines: [
    { procedureCode: "restoration", description: "Restoration", amount: pesos(2000) },
    { procedureCode: "fluoride", description: "Fluoride", amount: pesos(900) },
  ] },
  { id: "B", clinicId: "c", branchId: "b", patientId: "p2", appointmentId: "a2", issuedAt: local(9, 20), discount: 0, lines: [{ procedureCode: "oral_exam", description: "Exam", amount: pesos(500) }] },
];
const payments: Payment[] = [
  { ...base, id: "1", patientId: "p1", invoiceId: "A", amount: pesos(1000), method: "cash", receivedAt: local(10, 3) },
  { ...base, id: "2", patientId: "p1", invoiceId: "A", amount: -pesos(200), method: "cash", note: "Overpaid", receivedAt: local(10, 2) },
  { ...base, id: "3", patientId: "p1", invoiceId: "A", amount: pesos(800), method: "gcash", referenceNo: "1012", receivedAt: local(9, 29) },
  { ...base, id: "4", patientId: "p2", invoiceId: "B", amount: pesos(500), method: "cash", receivedAt: local(9, 20) },
];
const appt = (id: string, m: number, d: number, status: Appointment["status"]) => ({ id, patientId: "p1", startsAt: local(m, d, 9), reason: "Check-up", status });
const appointments = [appt("a1", 10, 1, "done"), appt("a2", 9, 20, "done"), appt("a3", 10, 2, "done"), appt("a4", 10, 5, "booked"), appt("a5", 8, 1, "done")];
const s = financeSummary({ invoices, payments, appointments }, "2026-10-03");
const sum = (xs: { amount: number }[]) => xs.reduce((t, x) => t + x.amount, 0);

describe("financial dashboard", () => {
  it("collects today, this week and this month, net of refunds", () => {
    expect(s.collected).toEqual({ today: pesos(1000), week: pesos(1600), month: pesos(800) });
  });

  it("charts series whose totals are exactly the sum of the payments", () => {
    expect(s.byDay).toHaveLength(14);
    expect(s.byDay.at(-1)).toEqual({ start: "2026-10-03", amount: pesos(1000) });
    expect(sum(s.byDay)).toBe(pesos(2100)); // Sep 20 is the first of the 14 days
    expect(s.byWeek.at(-1)).toEqual({ start: "2026-09-28", amount: pesos(1600) });
    expect(sum(s.byMonth)).toBe(sum(payments));
    expect(s.byMonth.slice(-2).map((b) => b.amount)).toEqual([pesos(1300), pesos(800)]);
    expect(sum(s.byMethod)).toBe(s.collected.month);
  });

  it("reports revenue by procedure for invoices issued this month, with discounts beside it", () => {
    expect(s.revenueByProcedure).toEqual([
      { procedureCode: "restoration", amount: pesos(2000), count: 1 },
      { procedureCode: "fluoride", amount: pesos(900), count: 1 },
    ]);
    expect(s.discounts).toBe(pesos(100));
  });

  it("lists outstanding balances and unpaid or unbilled appointments from the last 30 days", () => {
    expect(s.outstanding).toEqual([{ patientId: "p1", balance: pesos(1200) }]);
    expect(s.outstandingTotal).toBe(pesos(1200));
    expect(s.unpaidAppointments.map((a) => [a.appointmentId, a.balance])).toEqual([
      ["a3", undefined], // done, not billed
      ["a1", pesos(1200)], // billed, part-paid
    ]);
  });
});

describe("deposits on the dashboard", () => {
  // p1 leaves ₱1,000 on deposit today, and ₱600 of it is applied to invoice A (a transfer pair).
  const withDeposit: Payment[] = [
    ...payments,
    { ...base, id: "d1", patientId: "p1", amount: pesos(1000), method: "cash", receivedAt: local(10, 3, 11) },
    { ...base, id: "c1", patientId: "p1", invoiceId: "A", amount: pesos(600), method: "account_credit", receiptNo: "CR-000001", receivedAt: local(10, 3, 12) },
    { ...base, id: "c2", patientId: "p1", appliedTo: "A", amount: -pesos(600), method: "account_credit", receiptNo: "CR-000001", receivedAt: local(10, 3, 12) },
  ];
  const d = financeSummary({ invoices, payments: withDeposit, appointments }, "2026-10-03");
  it("counts a deposit as money in on the day, and never counts the transfer", () => {
    expect(d.collected.today).toBe(s.collected.today + pesos(1000));
    expect(d.byMethod.map((m) => m.method)).not.toContain("account_credit");
  });
  it("lowers the outstanding balance by what was applied, and holds the rest apart", () => {
    expect(d.outstandingTotal).toBe(s.outstandingTotal - pesos(600));
    expect(d.depositsHeld).toBe(pesos(400));
    expect(s.depositsHeld).toBe(0);
  });
});

describe("facts and summary (B8 E7)", () => {
  const inputs = { invoices, payments, appointments };

  it("compose to financeSummary", () => {
    expect(summarizeFinance(financeFacts(inputs, "2026-10-03"), "2026-10-03")).toEqual(s);
  });

  it("leave a voided bill out of revenue, discounts, outstanding and the unpaid appointments' bills", () => {
    const voided: Invoice = {
      id: "C", clinicId: "c", branchId: "b", patientId: "p3", appointmentId: "a3", issuedAt: local(10, 2), discount: pesos(50),
      lines: [{ procedureCode: "sealant", description: "Sealant", amount: pesos(1000) }], voided: { at: local(10, 2, 11), by: "u", reason: "Wrong child" },
    };
    const v = financeSummary({ ...inputs, invoices: [...invoices, voided] }, "2026-10-03");
    expect([v.revenueByProcedure, v.discounts, v.outstanding]).toEqual([s.revenueByProcedure, s.discounts, s.outstanding]);
    expect(v.unpaidAppointments.find((a) => a.appointmentId === "a3")).toEqual({ appointmentId: "a3", patientId: "p1", startsAt: local(10, 2, 9), reason: "Check-up" });
  });

  it("break ties by id, so any source lists equal rows in one order", () => {
    const facts = {
      collected: [], discounts: 0, deposits: [],
      balances: [{ patientId: "z", balance: 5 }, { patientId: "a", balance: 5 }],
      revenue: [{ procedureCode: "z", amount: 5, count: 1 }, { procedureCode: "a", amount: 5, count: 1 }],
      done: [{ appointmentId: "z", patientId: "p", startsAt: local(10, 1), reason: "r" }, { appointmentId: "a", patientId: "p", startsAt: local(10, 1), reason: "r" }],
    };
    const t = summarizeFinance(facts, "2026-10-03");
    expect([t.outstanding.map((r) => r.patientId), t.revenueByProcedure.map((r) => r.procedureCode), t.unpaidAppointments.map((r) => r.appointmentId)])
      .toEqual([["a", "z"], ["a", "z"], ["a", "z"]]);
  });

  it("reads collections from six months back", () => {
    expect(financeWindow("2026-10-03")).toEqual({ from: "2026-05-01", to: "2026-10-03" });
  });

  it("judge an appointment billed twice by its earlier bill", () => {
    const later: Invoice = { ...invoices[1]!, id: "B2", appointmentId: "a1", issuedAt: local(10, 2), lines: [{ procedureCode: "x", description: "x", amount: pesos(1) }] };
    const f = financeFacts({ ...inputs, invoices: [later, ...invoices] }, "2026-10-03");
    expect(f.done.find((d) => d.appointmentId === "a1")?.invoiceId).toBe("A");
  });

  it("floor each patient's deposits at zero", () => {
    expect(summarizeFinance({ collected: [], revenue: [], discounts: 0, balances: [], done: [], deposits: [{ patientId: "a", held: -5 }, { patientId: "b", held: 7 }] }, "2026-10-03").depositsHeld).toBe(7);
  });
});
