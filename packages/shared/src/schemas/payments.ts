import { z } from "zod";
import { PaymentMethod } from "./billing";
import { Centavos, Id, IsoDate, IsoDateTime, isoDate } from "./common";

// B12: Primolar's payment QR and the receipts clinics send (decisions 5–8, 21–24). Manual payments: the operator checks
// each receipt and confirms or rejects it; nothing is charged automatically (PayMongo waits for its own chunk).

/** What the clinic sees under the QR. The image is served on its own route. */
export const PaymentQrView = z.strictObject({ caption: z.string().nullable(), updatedAt: IsoDateTime });
export type PaymentQrView = z.infer<typeof PaymentQrView>;

/** PUT /operator/payment-qr, the `data` part (the image is the `file` part). An empty caption is none. */
export const PaymentQrInput = z.object({
  caption: z.string().trim().max(120, "Keep the text under 120 characters").transform((s) => s || null),
});
export type PaymentQrInput = z.infer<typeof PaymentQrInput>;

/** Images only: a QR screenshot and a receipt screenshot (decisions 5, 6, 26). */
export type ImageRules = { maxBytes: number; types: readonly string[] };
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const QR_RULES: ImageRules = { maxBytes: 2 * 1024 * 1024, types: IMAGE_TYPES };
export const RECEIPT_RULES: ImageRules = { maxBytes: 5 * 1024 * 1024, types: IMAGE_TYPES };

/** Why this image can't be used, in the form's and the server's words, or undefined. */
export function imageProblem(rules: ImageRules, file?: { type: string; size: number }): string | undefined {
  if (!file) return "Attach a screenshot of your receipt";
  if (!rules.types.includes(file.type)) return "Choose a PNG, JPG or WebP image";
  if (file.size > rules.maxBytes) return `The image must be ${rules.maxBytes / (1024 * 1024)} MB or smaller`;
  return undefined;
}

/** Both receipt uploads, the `data` part (the image is the `file` part). */
export const ReceiptUploadInput = z.object({
  reference: z.string().trim().min(1, "Enter the reference number on your receipt").max(60, "Keep the reference under 60 characters"),
});
export type ReceiptUploadInput = z.infer<typeof ReceiptUploadInput>;

export const ReceiptStatus = z.enum(["pending", "confirmed", "rejected"]);
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;
export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = { pending: "Primolar is checking it", confirmed: "Confirmed", rejected: "Not accepted" };

/** Decision 21: one receipt waits at a time; a rejected one can be followed by a new one. */
export const RECEIPT_PENDING = "Primolar is still checking your last receipt. If it isn't accepted, you can send a new one.";

/** A receipt as its sender sees it (the Owner on Settings → Plan, a sign-up on its status page). */
export const ReceiptView = z.strictObject({
  id: Id,
  reference: z.string(),
  amountDue: Centavos.nonnegative(),
  uploadedAt: IsoDateTime,
  status: ReceiptStatus,
  rejectionReason: z.string().nullable(),
  periodStart: IsoDate.nullable(), // the month it pays (subscriptions); null for a sign-up's setup fee and first month
});
export type ReceiptView = z.infer<typeof ReceiptView>;

/** Who sent it: a waiting sign-up or a clinic's subscription. */
export const ReceiptPayer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("signup"), signupId: Id }),
  z.strictObject({ kind: z.literal("subscription"), clinicId: Id }),
]);
export type ReceiptPayer = z.infer<typeof ReceiptPayer>;

/** GET /operator/receipts: Payments to check (decision 8), with whom each one is from. */
export const ReceiptToCheck = z.strictObject({
  ...ReceiptView.shape,
  payer: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("signup"), signupId: Id, signupReference: z.string(), clinicName: z.string() }),
    z.strictObject({ kind: z.literal("subscription"), clinicId: Id, clinicName: z.string() }),
  ]),
});
export type ReceiptToCheck = z.infer<typeof ReceiptToCheck>;

/** POST /operator/receipts/:id/confirm: how it was paid and when (decision 22: always the full amount due). */
export const ConfirmReceiptInput = z.object({
  method: PaymentMethod.exclude(["account_credit"]),
  paidOn: isoDate("Enter the date it was paid"),
});
export type ConfirmReceiptInput = z.infer<typeof ConfirmReceiptInput>;

/** POST /operator/receipts/:id/reject: the reason the payer reads (decisions 6, 22). */
export const RejectReceiptInput = z.object({
  reason: z.string().trim().min(1, "Tell them why the payment wasn't accepted").max(500, "Keep the reason under 500 characters"),
});
export type RejectReceiptInput = z.infer<typeof RejectReceiptInput>;

/** The mock's stored receipt (the API keeps the same in `PaymentReceipt`). `fileRef` null once purged (decision 15). */
export const PaymentReceipt = z.object({
  ...ReceiptView.shape,
  payer: ReceiptPayer,
  fileRef: z.string().nullable(),
  decidedAt: IsoDateTime.optional(),
});
export type PaymentReceipt = z.infer<typeof PaymentReceipt>;

/** The mock's stored QR. */
export const PaymentQr = z.object({ fileRef: z.string(), caption: z.string().nullable(), updatedAt: IsoDateTime });
export type PaymentQr = z.infer<typeof PaymentQr>;
