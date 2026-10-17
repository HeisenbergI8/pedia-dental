import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import type { Invoice } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { invoiceRows, paymentRows, receiptCounters, toInvoice, toPayment } from "./billing.rows";

const db = seedPlatform().tenants[DEMO_CLINIC_ID]!;
const roundTrip = (i: Invoice) => {
  const { invoice, lines } = invoiceRows(i);
  return toInvoice({ ...invoice, clinicId: i.clinicId }, [...lines].reverse()); // lines read back in any order
};

describe("billing rows ↔ the contract", () => {
  it("round-trips every seeded bill and payment", () => {
    expect(db.invoices.length).toBeGreaterThan(0);
    for (const i of db.invoices) expect(roundTrip(i)).toEqual(i);
    const rows = paymentRows(db.payments);
    db.payments.forEach((p, n) => expect(toPayment({ ...rows[n]!, clinicId: p.clinicId })).toEqual(p));
  });

  it("carries a void, and frees its treatments from the one-live-bill index", () => {
    const bill = { ...db.invoices[0]!, voided: { at: "2026-10-02T01:00:00.000Z", by: "staff_delacruz", reason: "Wrong child" } };
    expect(roundTrip(bill).voided).toEqual(bill.voided);
    expect(invoiceRows(bill).lines.every((l) => l.livePlanItemId === null)).toBe(true);
    expect(invoiceRows(db.invoices[0]!).lines.map((l) => l.livePlanItemId)).toEqual(db.invoices[0]!.lines.map((l) => l.planItemId ?? null));
  });

  it("numbers the legs of one receipt, and keeps each series' last number", () => {
    const pay = (id: string, receiptNo: string) => ({ ...db.payments[0]!, id, receiptNo });
    expect(paymentRows([pay("a", "CR-000001"), pay("b", "CR-000001"), pay("c", "AR-000009")]).map((r) => r.receiptLeg)).toEqual([0, 1, 0]);
    expect(receiptCounters([{ receiptNo: "AR-000002" }, { receiptNo: "AR-000007" }, { receiptNo: "CR-000001" }])).toEqual([
      { series: "AR", last: 7 },
      { series: "CR", last: 1 },
    ]);
    const seededAr = db.payments.filter((p) => p.receiptNo.startsWith("AR-")).map((p) => Number(p.receiptNo.slice(3)));
    expect(receiptCounters(db.payments).find((c) => c.series === "AR")?.last).toBe(Math.max(...seededAr));
  });
});
