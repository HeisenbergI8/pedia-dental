import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND_COLOR, formatPeso, pesos, vatPart, type SubscriptionPayment } from "@pedia/shared";
import { primolarInvoice } from "./primolar-invoice";

const payment: SubscriptionPayment = {
  id: "subpay_1",
  invoiceNo: "PRM-INV-00015",
  tier: "mid",
  periodStart: "2026-08-31",
  periodEnd: "2026-09-30",
  lines: [
    { label: "Setup fee", amount: pesos(10000) },
    { label: "First month", amount: pesos(5000) },
  ],
  amount: pesos(15000),
  method: "bank_transfer",
  reference: "BDO-7731",
  paidOn: "2026-08-30",
  recordedAt: "2026-08-31T09:00:00.000+08:00",
};
const billedTo = { name: "Hagikgik Kids Dental", tin: "456-789-012", contactEmail: "hello@hagikgik.demo" };

describe("primolarInvoice (billing #22, #33, S10)", () => {
  const doc = primolarInvoice(billedTo, payment);
  const rows = doc.blocks.flatMap((b) => (b.kind === "rows" ? b.rows : []));

  it("is Primolar's, not the clinic's: Primolar's name and plum ring, no logo", () => {
    expect(doc.letterhead).toMatchObject({ clinicName: "Primolar", ring: DEFAULT_BRAND_COLOR, logoUrl: null });
    expect(doc.fileName).toBe("PRM-INV-00015.pdf");
  });

  it("bills the clinic by name and TIN, lists every line, and shows the total and the VAT inside it", () => {
    expect(rows).toContainEqual(["Clinic", "Hagikgik Kids Dental"]);
    expect(rows).toContainEqual(["TIN", "456-789-012"]);
    const table = doc.blocks.find((b) => b.kind === "table");
    expect(table && table.kind === "table" && table.rows.map((r) => r[0])).toEqual(["Setup fee", "First month"]);
    expect(table && table.kind === "table" && table.foot).toEqual(["Total (VAT included)", formatPeso(pesos(15000))]);
    expect(rows).toContainEqual(["VAT (12%) included", formatPeso(vatPart(pesos(15000)))]);
  });

  it("says it is not an official receipt (billing #33)", () => expect(doc.footnote).toMatch(/not an official receipt/i));
});
