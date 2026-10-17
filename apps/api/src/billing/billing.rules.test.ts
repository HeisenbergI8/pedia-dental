import { pesos } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import {
  creditRefusal, depositRefusal, duplicateRefusal, invoiceAppointment, invoiceRefusal, paymentRefusal, refundRefusal, voidRefusal,
} from "./billing.rules";

const bill = (php: number, voided = false) => ({
  id: "i", discount: 0, lines: [{ amount: pesos(php) }], ...(voided && { voided: { at: "2026-10-02T00:00:00Z", by: "u", reason: "r" } }),
});
const words = (r: { status: number; message: string } | undefined) => r && [r.status, r.message];

describe("billing refusals (features/billing/mocks.ts)", () => {
  it("leaves refunds to the Owner and admins (decision 3)", () => {
    expect(words(refundRefusal(-1, ["front_desk"]))).toEqual([403, "Only the Owner or an admin can record a refund"]);
    expect(refundRefusal(-1, ["admin"])).toBeUndefined();
    expect(refundRefusal(1, ["front_desk"])).toBeUndefined();
  });

  it("bills each treatment once, only done unbilled ones, and a discount within the subtotal", () => {
    expect(words(duplicateRefusal(["a", "a"]))).toEqual([400, "A treatment is listed twice"]);
    expect(duplicateRefusal(["a", "b"])).toBeUndefined();
    expect(words(invoiceRefusal(["a", "x"], ["a"], 100, 200))).toEqual([409, "Only this patient's completed, not yet billed treatments can be invoiced"]);
    expect(words(invoiceRefusal(["a"], ["a"], pesos(800), pesos(900)))?.[1]).toMatch(/^The discount can't be more than ₱800\.00$/);
    expect(invoiceRefusal(["a"], ["a"], 100, 100)).toBeUndefined();
  });

  it("links a bill to an appointment only when all its visits share one", () => {
    const of = new Map([["v1", "a1"], ["v2", "a1"], ["v3", "a2"], ["v4", undefined]]);
    expect(invoiceAppointment(["v1", "v2"], of)).toBe("a1");
    expect(invoiceAppointment(["v1", "v3"], of)).toBeUndefined();
    expect(invoiceAppointment(["v1", undefined], of)).toBeUndefined();
  });

  it("caps a payment at the balance and a refund at the cash paid, and refuses a voided bill", () => {
    expect(words(paymentRefusal(bill(800, true), { all: 0, credit: 0 }, 1))).toEqual([409, "This bill was voided"]);
    expect(paymentRefusal(bill(800), { all: pesos(300), credit: 0 }, pesos(500))).toBeUndefined(); // exactly the balance
    expect(words(paymentRefusal(bill(800), { all: pesos(300), credit: 0 }, pesos(501)))?.[1]).toBe("That's more than the ₱500.00 balance");
    expect(paymentRefusal(bill(800), { all: pesos(300), credit: 0 }, -pesos(300))).toBeUndefined(); // exactly the cash paid
    expect(words(paymentRefusal(bill(800), { all: pesos(300), credit: pesos(100) }, -pesos(300)))?.[1]).toBe("A refund can't be more than the ₱200.00 paid");
  });

  it("refunds no more deposit than is held", () => {
    expect(words(depositRefusal(pesos(100), -pesos(101)))?.[1]).toBe("A refund can't be more than the ₱100.00 deposit");
    expect(depositRefusal(pesos(100), -pesos(100))).toBeUndefined();
  });

  it("moves credit within what is held, owed and applied, never on a voided bill", () => {
    expect(words(creditRefusal(bill(800, true), { all: 0, credit: 0 }, pesos(900), 1))).toEqual([409, "This bill was voided"]);
    expect(words(creditRefusal(bill(800), { all: 0, credit: 0 }, pesos(100), pesos(200)))?.[1]).toBe("Only ₱100.00 is on deposit");
    expect(words(creditRefusal(bill(800), { all: pesos(700), credit: 0 }, pesos(500), pesos(200)))?.[1]).toBe("That's more than the ₱100.00 balance");
    expect(words(creditRefusal(bill(800), { all: pesos(200), credit: pesos(200) }, 0, -pesos(300)))).toEqual([409, "That's more than was applied from the deposit"]);
    expect(creditRefusal(bill(800), { all: pesos(200), credit: pesos(200) }, 0, -pesos(200))).toBeUndefined();
  });

  it("voids only a live bill no payment row ever touched (decision 2)", () => {
    expect(words(voidRefusal(bill(800, true), 0))).toEqual([409, "This bill is already voided"]);
    expect(words(voidRefusal(bill(800), 2))).toEqual([409, "Only a bill with nothing paid or applied on it can be voided"]);
    expect(voidRefusal(bill(800), 0)).toBeUndefined();
  });
});
