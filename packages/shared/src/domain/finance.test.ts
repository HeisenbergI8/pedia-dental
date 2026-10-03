import { describe, expect, it } from "vitest";
import type { Appointment } from "../schemas/appointment";
import type { Invoice, Payment } from "../schemas/billing";
import { financeSummary } from "./finance";
import { pesos } from "./money";

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString();
const base = { clinicId: "c", receiptNo: "AR-000001", receivedBy: "staff_cruz" };
const invoices: Invoice[] = [
  { id: "A", clinicId: "c", patientId: "p1", appointmentId: "a1", issuedAt: local(10, 1), discount: pesos(100), lines: [
    { procedureCode: "restoration", description: "Restoration", amount: pesos(2000) },
    { procedureCode: "fluoride", description: "Fluoride", amount: pesos(900) },
  ] },
  { id: "B", clinicId: "c", patientId: "p2", appointmentId: "a2", issuedAt: local(9, 20), discount: 0, lines: [{ procedureCode: "oral_exam", description: "Exam", amount: pesos(500) }] },
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
