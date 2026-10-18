import { addDays, format } from "date-fns";
import { subscriptionDueOn, type PaymentReceipt, type Subscription } from "@pedia/shared";
import { IPIN_ID } from "./seed-ipin";
import { SEED_PRICES } from "./seed-signups";

/** The seeded receipt's file: served from SEED_FILES' PNG, so "Reset demo data" never loses it (as the seeded photos). */
export const SEED_RECEIPT_REF = "seed/receipt-ipin";

/**
 * B12: one receipt waiting in Payments to check (decision 8): Ipin, 3 days overdue, sent last night for its first unpaid
 * month at the Small monthly fee. No QR is seeded, so the demo opens on "Primolar will send you payment details" (23).
 */
export function seedReceipts(subscriptions: Subscription[]): PaymentReceipt[] {
  const ipin = subscriptions.find((s) => s.clinicId === IPIN_ID)!;
  const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
  return [
    {
      id: "receipt_seed_ipin",
      payer: { kind: "subscription", clinicId: IPIN_ID },
      reference: "GC 5012 3344 7781",
      amountDue: SEED_PRICES.plans.small.monthlyFee,
      periodStart: subscriptionDueOn(ipin.anchor, ipin.paidMonths),
      uploadedAt: new Date(`${yesterday}T21:14:00+08:00`).toISOString(),
      status: "pending",
      rejectionReason: null,
      fileRef: SEED_RECEIPT_REF,
    },
  ];
}
