import { describe, expect, it } from "vitest";
import type { PriceList } from "../schemas/signup";
import { pesos } from "./money";
import {
  DUPLICATE_EMAIL_MESSAGE,
  SIGNUP_REFUSED_MESSAGE,
  UNPAID_SIGNUP_REASON,
  amountDue,
  publicClashMessage,
  unpaidSignupExpired,
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
  textPack: { parts: 100, price: pesos(150) },
};

describe("amount due (billing #22, #24)", () => {
  it("is setup + first month, with the design add-on only for Design it for me", () => {
    expect(amountDue(PRICES, "small", "own").total).toBe(pesos(7500));
    expect(amountDue(PRICES, "small", "default").designAddOn).toBe(0);
    const designed = amountDue(PRICES, "mid", "designed");
    expect(designed).toMatchObject({ setupFee: pesos(10000), firstMonth: pesos(5000), designAddOn: pesos(7500), total: pesos(22500) });
    expect(amountDue(PRICES, "big", "designed").designAddOn).toBe(0); // Pro includes it (feature 16, revised)
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

describe("unpaid sign-ups and the public form's words (#17, #29)", () => {
  // Sent at 23:30 on 1 Nov Manila (15:30 UTC): Manila's day counts, not UTC's.
  const sent = { status: "waiting" as const, submittedAt: "2026-11-01T15:30:00.000Z" };
  it("expires a waiting, unpaid sign-up 14 Manila days after it was sent, and nothing paid or decided", () => {
    expect(unpaidSignupExpired(sent, "2026-11-14")).toBe(false);
    expect(unpaidSignupExpired(sent, "2026-11-15")).toBe(true);
    expect(unpaidSignupExpired({ ...sent, payment: { method: "gcash", paidOn: "2026-11-02", amount: 1, recordedAt: "2026-11-02T00:00:00.000Z" } }, "2026-12-01")).toBe(false);
    expect(unpaidSignupExpired({ ...sent, status: "rejected" }, "2026-12-01")).toBe(false);
    expect(UNPAID_SIGNUP_REASON).toBe("Not paid within 14 days");
  });
  it("names no clinic or email to the public form, but for a resubmission of the same sign-up", () => {
    expect(publicClashMessage(false)).toBe(SIGNUP_REFUSED_MESSAGE);
    expect(publicClashMessage(true)).toBe(DUPLICATE_EMAIL_MESSAGE);
    expect(duplicateField(SIGNUP_REFUSED_MESSAGE)).toBeUndefined(); // the form shows it as the form's own error
  });
});
