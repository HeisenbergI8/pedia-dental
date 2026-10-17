import { describe, expect, it } from "vitest";
import type { Payment } from "../schemas/billing";
import type { PlanItem } from "../schemas/plan";
import { accountCredit, accountSummary, appliedCredit, depositBalance, depositLegs, depositPool, formatPeso, invoiceBalance, invoiceTotal, isMoneyIn, pesos, unbilledItems } from "./money";

describe("money", () => {
  it("matches the spec example: 8,500 total, 5,000 paid, 3,500 balance", () => {
    const inv = { id: "i1", lines: [{ procedureCode: "x", description: "x", amount: pesos(8500) }], discount: 0 };
    const pay = { clinicId: "c1", branchId: "b", id: "p1", patientId: "pt1", invoiceId: "i1", amount: pesos(5000), method: "cash" as const, receiptNo: "AR-000001", receivedBy: "u1", receivedAt: "2026-01-01T00:00:00Z" };
    expect(invoiceBalance(inv, [pay])).toBe(pesos(3500));
  });
  it("formats pesos", () => {
    expect(formatPeso(350000)).toContain("3,500.00");
  });

  const paid = (id: string, amount: number, invoiceId = "inv"): Payment => ({
    clinicId: "c1", branchId: "b", id, patientId: "pt1", invoiceId, amount, method: "cash", receiptNo: id, receivedBy: "u1", receivedAt: "2026-10-03T01:00:00Z",
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
    const pay = (amount: number): Payment => ({ id: String(amount), clinicId: "c", branchId: "b", patientId: "p", invoiceId: "A", amount, method: "cash", receiptNo: "AR-1", receivedBy: "s", receivedAt: "2026-10-01T00:00:00.000Z" });
    expect(accountCredit([inv], [pay(pesos(500))])).toBe(0);
    expect(accountCredit([inv], [pay(pesos(200))])).toBe(0);
    expect(accountCredit([inv], [pay(pesos(700))])).toBe(pesos(200));
  });
});

describe("deposits", () => {
  const row = (id: string, patientId: string, amount: number, extra: Partial<Payment> = {}): Payment =>
    ({ id, clinicId: "c", branchId: "b", patientId, amount, method: "cash", receiptNo: "AR-1", receivedBy: "s", receivedAt: "2026-10-01T00:00:00.000Z", ...extra });
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

describe("voided bills (B8 decision 2)", () => {
  const VOID = { at: "2026-10-02T00:00:00.000Z", by: "u1", reason: "Wrong tooth" };
  const bill = (id: string, php: number, planItemId?: string) => ({ id, discount: 0, lines: [{ planItemId, procedureCode: "x", description: "x", amount: pesos(php) }] });
  const row = (invoiceId: string, php: number) => ({ invoiceId, amount: pesos(php) });

  it("owe nothing and count in no account, so the 8,500 example holds beside one", () => {
    const voided = { ...bill("v", 800), voided: VOID };
    expect(invoiceBalance(voided, [])).toBe(0);
    expect(accountSummary([bill("i", 8500), voided], [row("i", 5000)])).toEqual({ total: pesos(8500), paid: pesos(5000), balance: pesos(3500) });
    expect(accountCredit([voided], [row("v", 900)])).toBe(0);
  });

  it("free their treatments to be billed again, unless a live bill has them", () => {
    const item = { id: "it", clinicId: "c", patientId: "p", procedureCode: "x", fee: 1, status: "done" as const, createdAt: "2026-10-01T00:00:00Z" } as PlanItem;
    const voided = { ...bill("v", 1, "it"), voided: VOID };
    expect(unbilledItems([item], [voided]).map((i) => i.id)).toEqual(["it"]);
    expect(unbilledItems([item], [bill("l", 1, "it")])).toEqual([]);
    expect(unbilledItems([item], [voided, bill("l", 1, "it")])).toEqual([]);
  });
});

describe("deposit legs (B8 E10)", () => {
  const dep = (branchId: string, php: number, appliedTo?: string) => ({ patientId: "p", branchId, amount: pesos(php), ...(appliedTo && { appliedTo }) });

  it("draw from the bill's branch first, then in the order branches first held money", () => {
    const pool = depositPool([dep("imus", 300), dep("dasma", 400)], "p", "inv", pesos(500));
    expect(pool).toEqual([["imus", pesos(300)], ["dasma", pesos(400)]]);
    expect(depositLegs("dasma", pool, pesos(500))).toEqual([["dasma", -pesos(400)], ["imus", -pesos(100)]]);
  });

  it("return money to the branches it was drawn from for this bill only", () => {
    const rows = [dep("imus", 300), dep("dasma", 400), dep("dasma", -400, "inv"), dep("imus", -100, "inv"), dep("imus", -50, "other")];
    const pool = depositPool(rows, "p", "inv", -pesos(500));
    expect(pool).toEqual([["dasma", pesos(400)], ["imus", pesos(100)]]);
    expect(depositLegs("dasma", pool, -pesos(500))).toEqual([["dasma", pesos(400)], ["imus", pesos(100)]]);
  });

  it("skip empty branches and never take more than is held", () => {
    expect(depositLegs("imus", [["imus", 0], ["dasma", -pesos(5)], ["bacoor", pesos(100)]], pesos(500))).toEqual([["bacoor", -pesos(100)]]);
  });
});
