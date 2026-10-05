import { describe, expect, it } from "vitest";
import type { Payment } from "../schemas/billing";
import type { PlanItem } from "../schemas/plan";
import { accountCredit, accountSummary, appliedCredit, depositBalance, formatPeso, invoiceBalance, invoiceTotal, isMoneyIn, pesos, unbilledItems } from "./money";

describe("money", () => {
  it("matches the spec example: 8,500 total, 5,000 paid, 3,500 balance", () => {
    const inv = { id: "i1", lines: [{ procedureCode: "x", description: "x", amount: pesos(8500) }], discount: 0 };
    const pay = { clinicId: "c1", id: "p1", patientId: "pt1", invoiceId: "i1", amount: pesos(5000), method: "cash" as const, receiptNo: "AR-000001", receivedBy: "u1", receivedAt: "2026-01-01T00:00:00Z" };
    expect(invoiceBalance(inv, [pay])).toBe(pesos(3500));
  });
  it("formats pesos", () => {
    expect(formatPeso(350000)).toContain("3,500.00");
  });

  const paid = (id: string, amount: number, invoiceId = "inv"): Payment => ({
    clinicId: "c1", id, patientId: "pt1", invoiceId, amount, method: "cash", receiptNo: id, receivedBy: "u1", receivedAt: "2026-10-03T01:00:00Z",
  });

  it("reproduces the spec example from the example plan's catalog fees, in two partial payments", () => {
    const fees = [1200, 800, 2000, 2000, 2000, 500]; // prophylaxis, fluoride, 3 restorations, follow-up
    const inv = { id: "inv", discount: 0, lines: fees.map((php) => ({ procedureCode: "x", description: "x", amount: pesos(php) })) };
    const payments = [paid("p1", pesos(3000)), paid("p2", pesos(2000)), paid("other", pesos(999), "another_invoice")];
    expect(invoiceTotal(inv)).toBe(pesos(8500));
    expect(invoiceBalance(inv, payments)).toBe(pesos(3500));
    expect(accountSummary([inv], payments.slice(0, 2))).toEqual({ total: pesos(8500), paid: pesos(5000), balance: pesos(3500) });
  });

  it("takes a discount off the total, and a refund (a negative payment) adds back to the balance", () => {
    const inv = { id: "inv", discount: pesos(100), lines: [{ procedureCode: "fluoride", description: "x", amount: pesos(800) }] };
    expect(invoiceTotal(inv)).toBe(pesos(700));
    expect(invoiceBalance(inv, [paid("p1", pesos(700)), paid("r1", -pesos(200))])).toBe(pesos(200));
  });

  it("lists done plan items that no invoice bills yet", () => {
    const item = (id: string, status: PlanItem["status"]): PlanItem => ({
      clinicId: "c1", id, patientId: "pt1", procedureCode: "fluoride", fee: pesos(800), status, createdAt: "2026-10-03T01:00:00Z",
    });
    const items = [item("billed", "done"), item("open", "planned"), item("ready", "done")];
    const invoices = [{ lines: [{ planItemId: "billed", procedureCode: "fluoride", description: "x", amount: pesos(800) }] }];
    expect(unbilledItems(items, invoices).map((i) => i.id)).toEqual(["ready"]);
  });

  it("counts an overpaid invoice as credit, never a paid or part-paid one", () => {
    const inv = { id: "A", lines: [{ procedureCode: "x", description: "x", amount: pesos(500) }], discount: 0 };
    const pay = (amount: number): Payment => ({ id: String(amount), clinicId: "c", patientId: "p", invoiceId: "A", amount, method: "cash", receiptNo: "AR-1", receivedBy: "s", receivedAt: "2026-10-01T00:00:00.000Z" });
    expect(accountCredit([inv], [pay(pesos(500))])).toBe(0);
    expect(accountCredit([inv], [pay(pesos(200))])).toBe(0);
    expect(accountCredit([inv], [pay(pesos(700))])).toBe(pesos(200));
  });
});

describe("deposits", () => {
  const row = (id: string, patientId: string, amount: number, extra: Partial<Payment> = {}): Payment =>
    ({ id, clinicId: "c", patientId, amount, method: "cash", receiptNo: "AR-1", receivedBy: "s", receivedAt: "2026-10-01T00:00:00.000Z", ...extra });
  const inv = { id: "INV", lines: [{ procedureCode: "x", description: "x", amount: pesos(800) }], discount: 0 };
  const rows = [
    row("d", "p", pesos(1000)), // deposit
    row("r", "p", -pesos(200), { note: "Changed plans" }), // deposit refund
    row("a1", "p", pesos(600), { invoiceId: "INV", method: "account_credit" }), // applied: invoice side
    row("a2", "p", -pesos(600), { appliedTo: "INV", method: "account_credit" }), // applied: deposit side
    row("x", "other", pesos(5000)), // another child's deposit
  ];
  it("holds what was deposited, less refunds and what was applied, per patient", () => {
    expect(depositBalance(rows, "p")).toBe(pesos(200));
    expect(depositBalance(rows, "other")).toBe(pesos(5000));
  });
  it("pays the invoice with the applied amount, and knows how much can go back", () => {
    expect(invoiceBalance(inv, rows)).toBe(pesos(200));
    expect(appliedCredit("INV", rows)).toBe(pesos(600));
  });
  it("treats only the transfer as not money in", () => {
    expect(rows.filter(isMoneyIn).map((p) => p.id)).toEqual(["d", "r", "x"]);
  });
});
