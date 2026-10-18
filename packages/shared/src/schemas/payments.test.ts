import { describe, expect, it } from "vitest";
import { ConfirmReceiptInput, PaymentQrInput, RECEIPT_RULES, ReceiptToCheck, imageProblem } from "./payments";
import { SignupStatusView } from "./signup";

describe("payment shapes (B12)", () => {
  it("keeps the sign-up status page to its own fields", () => {
    const view = { reference: "PRM-AAAA-BBBB", clinicName: "X", tier: "small", branding: "default", quote: { setupFee: 0, firstMonth: 0, designAddOn: 0, total: 0, vat: 0 }, status: "waiting", paid: false, rejectionReason: null, receipt: null, paymentQr: null };
    expect(SignupStatusView.safeParse({ ...view, fileKey: "x" }).success).toBe(false);
  });
  it("treats a blank caption as none", () => {
    expect(PaymentQrInput.parse({ caption: "   " }).caption).toBeNull();
  });
  it("names what's wrong with a receipt image", () => {
    expect(imageProblem(RECEIPT_RULES)).toBe("Attach a screenshot of your receipt");
    expect(imageProblem(RECEIPT_RULES, { type: "image/gif", size: 1 })).toBe("Choose a PNG, JPG or WebP image");
    expect(imageProblem(RECEIPT_RULES, { type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe("The image must be 5 MB or smaller");
    expect(imageProblem(RECEIPT_RULES, { type: "image/png", size: 5 * 1024 * 1024 })).toBeUndefined();
  });
  it("never mixes a sign-up into a subscription payer", () => {
    const base = { id: "r1", reference: "x", amountDue: 1, uploadedAt: "2026-10-18T00:00:00.000Z", status: "pending", rejectionReason: null, periodStart: null };
    expect(ReceiptToCheck.safeParse({ ...base, payer: { kind: "subscription", clinicId: "c", clinicName: "C", signupId: "s" } }).success).toBe(false);
  });
  it("confirms only a real payment method", () => {
    expect(ConfirmReceiptInput.safeParse({ method: "account_credit", paidOn: "2026-10-18" }).success).toBe(false);
  });
});
