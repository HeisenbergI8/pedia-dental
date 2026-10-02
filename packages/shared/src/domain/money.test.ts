import { describe, expect, it } from "vitest";
import { formatPeso, invoiceBalance, pesos } from "./money";

describe("money", () => {
  it("matches the spec example: 8,500 total, 5,000 paid, 3,500 balance", () => {
    const inv = { id: "i1", lines: [{ procedureCode: "x", description: "x", amount: pesos(8500) }], discount: 0 };
    const pay = { clinicId: "c1", id: "p1", invoiceId: "i1", amount: pesos(5000), method: "cash" as const, receivedBy: "u1", receivedAt: "2026-01-01T00:00:00Z" };
    expect(invoiceBalance(inv, [pay])).toBe(pesos(3500));
  });
  it("formats pesos", () => {
    expect(formatPeso(350000)).toContain("3,500.00");
  });
});
