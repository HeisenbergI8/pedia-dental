import { describe, expect, it } from "vitest";
import type { PriceList } from "../schemas/signup";
import { pesos } from "./money";
import {
  DUPLICATE_EMAIL_MESSAGE,
  amountDue,
  duplicateField,
  duplicateNameMessage,
  referenceImagesProblem,
  sameClinicName,
  signupStatusLabel,
  vatPart,
} from "./signup";

const PRICES: PriceList = {
  plans: {
    small: { setupFee: pesos(5000), monthlyFee: pesos(2500) },
    mid: { setupFee: pesos(10000), monthlyFee: pesos(5000) },
    big: { setupFee: pesos(20000), monthlyFee: pesos(10000) },
  },
  designAddOn: pesos(7500),
};

describe("amount due (billing #22, #24)", () => {
  it("is setup + first month, with the design add-on only for Design it for me", () => {
    expect(amountDue(PRICES, "small", "own").total).toBe(pesos(7500));
    expect(amountDue(PRICES, "small", "default").designAddOn).toBe(0);
    const designed = amountDue(PRICES, "mid", "designed");
    expect(designed).toMatchObject({ setupFee: pesos(10000), firstMonth: pesos(5000), designAddOn: pesos(7500), total: pesos(22500) });
  });

  it("shows the VAT inside a VAT-inclusive price, to the centavo", () => {
    expect(vatPart(pesos(112))).toBe(pesos(12));
    expect(vatPart(pesos(7500))).toBe(80357); // ₱803.57
    expect(amountDue(PRICES, "small", "own").vat).toBe(vatPart(pesos(7500)));
    expect(vatPart(0)).toBe(0);
  });
});

describe("duplicate names (billing #10, platform #63)", () => {
  it("ignores case and extra spaces, and nothing else", () => {
    expect(sameClinicName("  Bulilit   Smiles ", "bulilit smiles")).toBe(true);
    expect(sameClinicName("Bulilit Smiles", "Bulilit Smile")).toBe(false);
  });
});

describe("duplicate refusals map to their field (billing #10)", () => {
  it("names the field for the two duplicate messages and nothing else", () => {
    expect(duplicateField(duplicateNameMessage(" Ngiti Kids "))).toBe("account.name");
    expect(duplicateField(DUPLICATE_EMAIL_MESSAGE)).toBe("account.contactEmail");
    expect(duplicateField("The setup fee is already recorded for this plan and look.")).toBeUndefined();
  });
});

describe("sign-up status labels (A3, billing #14)", () => {
  const paid = { amount: 1, method: "gcash" as const, paidOn: "2026-10-13", recordedAt: "2026-10-13T00:00:00.000Z" };
  it("names each state the console and the client see", () => {
    expect(signupStatusLabel({ status: "waiting" })).toBe("Waiting for setup fee");
    expect(signupStatusLabel({ status: "waiting", payment: paid })).toBe("Paid, ready to approve");
    expect(signupStatusLabel({ status: "approved", payment: paid })).toBe("Approved");
    expect(signupStatusLabel({ status: "rejected" })).toBe("Rejected");
    expect(signupStatusLabel({ status: "rejected", payment: paid })).toBe("Rejected, refunded");
  });
});

describe("reference images (billing #9, A7)", () => {
  const png = (size = 10) => ({ type: "image/png", size });
  it("takes up to three PNG or JPG files of 5 MB or less", () => {
    expect(referenceImagesProblem([png(), png(), png()])).toBeUndefined();
    expect(referenceImagesProblem([png(), png(), png(), png()])).toMatch(/up to 3/);
    expect(referenceImagesProblem([{ type: "image/gif", size: 10 }])).toMatch(/PNG or JPG/);
    expect(referenceImagesProblem([png(6 * 1024 * 1024)])).toMatch(/5 MB/);
  });
});
