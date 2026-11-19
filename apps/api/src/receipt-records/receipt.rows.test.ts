import { describe, expect, it } from "vitest";
import { payerOf, payerWhere } from "./receipt.rows";

describe("receipt payers (B12, feature 16 revised)", () => {
  it("reads and finds all three payers, the text top-up apart from the month", () => {
    expect(payerOf({ purpose: "signup", signupId: "s1", clinicId: null })).toEqual({ kind: "signup", signupId: "s1" });
    expect(payerOf({ purpose: "subscription", signupId: null, clinicId: "c1" })).toEqual({ kind: "subscription", clinicId: "c1" });
    expect(payerOf({ purpose: "text_topup", signupId: null, clinicId: "c1" })).toEqual({ kind: "text_topup", clinicId: "c1" });
    expect(payerWhere({ kind: "text_topup", clinicId: "c1" })).toEqual({ purpose: "text_topup", clinicId: "c1" });
    expect(payerWhere({ kind: "subscription", clinicId: "c1" })).toEqual({ purpose: "subscription", clinicId: "c1" });
  });
});
