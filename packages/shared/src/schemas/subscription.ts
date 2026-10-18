import { z } from "zod";
import { Centavos, Id, IsoDate, IsoDateTime } from "./common";
import { PaymentQrView, ReceiptView } from "./payments";
import { UpfrontPayment } from "./signup";
import { Tier } from "./tenancy";

/** One line on a Primolar invoice (S15). Not the clinic's `InvoiceLine`, which bills a patient. */
export const SubscriptionLine = z.object({ label: z.string(), amount: Centavos.nonnegative() });
export type SubscriptionLine = z.infer<typeof SubscriptionLine>;

/**
 * One payment to Primolar and its invoice (billing #29, #33). Chunk 22's `UpfrontPayment` (method, reference, paid on,
 * amount, recorded at) plus the invoice: its number, the plan billed, the period it pays for, and its lines.
 */
export const SubscriptionPayment = UpfrontPayment.extend({
  id: Id,
  invoiceNo: z.string().regex(/^PRM-INV-\d{5}$/), // primolarInvoiceNo (domain/subscription)
  tier: Tier, // the plan this period is billed at
  periodStart: IsoDate,
  periodEnd: IsoDate, // the next due date: the period runs up to it, not including it
  lines: z.array(SubscriptionLine).min(1),
});
export type SubscriptionPayment = z.infer<typeof SubscriptionPayment>;

/** Why the subscription paused the clinic (S3). Absent for a pause the operator made by hand. */
export const SubscriptionPause = z.enum(["overdue", "cancelled"]);
export type SubscriptionPause = z.infer<typeof SubscriptionPause>;

/**
 * A clinic's monthly subscription (billing #25–#30). Stored in `Platform.subscriptions`, beside the accounts and never
 * inside a tenant. The plan itself is `ClinicAccount.tier`; this holds only what billing adds.
 */
export const Subscription = z.object({
  clinicId: Id,
  anchor: IsoDate, // the approval date (billing #26, S13); every due date is counted from it
  paidMonths: z.number().int().positive(), // months paid since the anchor; the next due date is subscriptionDueOn(anchor, paidMonths)
  // A downgrade waiting for its date (billing #27, S6): `on` is the next due date when it was asked for, so paying a
  // month early never pushes it back.
  downgrade: z.object({ tier: Tier, on: IsoDate }).optional(),
  // Billing #27: each month is billed at the plan in force when it began. A plan change made while a month is already
  // running (the clinic is overdue) keeps the old plan's price for months that start before `until`.
  priceTier: z.object({ tier: Tier, until: IsoDate }).optional(),
  cancelledAt: IsoDateTime.optional(), // billing #30: pauses the clinic when the paid month ends
  pause: SubscriptionPause.optional(),
  payments: z.array(SubscriptionPayment), // append-only, oldest first
});
export type Subscription = z.infer<typeof Subscription>;

/** S4. `lapsed` and `ended` mean the clinic is paused by the subscription. */
export const SubscriptionState = z.enum(["paid", "due_soon", "overdue", "lapsed", "ending", "ended"]);
export type SubscriptionState = z.infer<typeof SubscriptionState>;

/**
 * GET /clinic/subscription (the Owner, billing #31) and GET /operator/accounts/:id/subscription (the console). One
 * shape for both (S14), strict so nothing else rides along. Every date and state is the server's: no client clock.
 */
export const SubscriptionView = z.strictObject({
  clinicId: Id,
  billedTo: z.strictObject({ name: z.string(), tin: z.string(), contactEmail: z.string() }), // the invoice's "Billed to"
  tier: Tier,
  nextTier: Tier, // the plan the next unpaid month is billed at (nextAmount's plan)
  downgrade: z.strictObject({ tier: Tier, on: IsoDate }).nullable(),
  state: SubscriptionState,
  nextDue: IsoDate,
  payBy: IsoDate, // nextDue + GRACE_DAYS
  daysUntilDue: z.number().int(), // negative once overdue
  nextAmount: Centavos.nonnegative(), // the next unpaid month at today's price for nextTier (S5)
  nextVat: Centavos.nonnegative(),
  cancelledAt: IsoDateTime.nullable(),
  pausedFor: SubscriptionPause.nullable(),
  payments: z.array(SubscriptionPayment), // newest first
  receipts: z.array(ReceiptView), // B12: this clinic's receipts, newest first (decisions 6, 21)
  paymentQr: PaymentQrView.nullable(), // B12 decision 23: null until the operator adds one
  today: IsoDate, // the server's date, so a form's "paid on" default follows the demo clock
});
export type SubscriptionView = z.infer<typeof SubscriptionView>;
