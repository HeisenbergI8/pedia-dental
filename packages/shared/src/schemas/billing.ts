import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDateTime } from "./common";

/** `account_credit`: a transfer from the patient's deposit to an invoice. Set by the server only, never a way to pay. */
export const PaymentMethod = z.enum(["cash", "gcash", "maya", "card", "bank_transfer", "account_credit"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;
/** The methods money actually arrives by: what a payment or deposit form offers. */
export const MONEY_METHODS = PaymentMethod.options.filter((m) => m !== "account_credit");

export const InvoiceLine = z.object({
  /** The done plan item this line bills. A plan item is billed at most once. */
  planItemId: Id.optional(),
  procedureCode: z.string(),
  description: z.string(),
  tooth: z.number().int().optional(),
  amount: Centavos,
});

export const Invoice = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id.optional(),
  /** The appointment these treatments were done in, when there was one: links "unpaid appointments". */
  appointmentId: Id.optional(),
  lines: z.array(InvoiceLine).min(1),
  discount: Centavos.default(0),
  issuedAt: IsoDateTime,
});
export type Invoice = z.infer<typeof Invoice>;

/**
 * Payments are append-only. Refunds are negative payments. Without `invoiceId` a row is money held on the patient's
 * account: a deposit (+), a deposit refund (−), or the deposit side of applying credit to an invoice (−, `appliedTo`).
 */
export const Payment = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  invoiceId: Id.optional(),
  /** On the deposit side of a credit application: the invoice it went to. */
  appliedTo: Id.optional(),
  amount: Centavos,
  method: PaymentMethod,
  referenceNo: z.string().optional(),
  /** Why, on a refund. */
  note: z.string().optional(),
  /** Acknowledgment receipt number, AR-000001 (not a BIR official receipt, deferred). Credit applications share a CR-000001. */
  receiptNo: z.string(),
  receivedBy: Id,
  receivedAt: IsoDateTime,
});
export type Payment = z.infer<typeof Payment>;

/** An invoice is built from done, unbilled plan items; the server copies names and fees onto the lines. */
export const CreateInvoiceInput = z.object({
  planItemIds: z.array(Id).min(1, "Pick at least one completed treatment"),
  discount: Centavos.nonnegative("A discount can't be negative").default(0),
});
export type CreateInvoiceInput = z.input<typeof CreateInvoiceInput>;

/** A positive amount is a payment, a negative one a refund. */
export const RecordPaymentInput = Payment.pick({ amount: true, method: true, referenceNo: true, note: true, receivedBy: true })
  .refine((p) => p.amount !== 0, { message: "Enter an amount", path: ["amount"] })
  .refine((p) => p.method !== "account_credit", { message: "Pick how the money was paid", path: ["method"] })
  .refine((p) => p.method === "cash" || !!p.referenceNo?.trim(), { message: "Enter the reference number", path: ["referenceNo"] })
  .refine((p) => p.amount > 0 || !!p.note?.trim(), { message: "Give a reason for the refund", path: ["note"] });
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

/** Move deposit money onto an invoice (+) or back to the deposit (−). */
export const ApplyCreditInput = z.object({
  amount: Centavos.refine((a) => a !== 0, "Enter an amount"),
  receivedBy: Id,
});
export type ApplyCreditInput = z.infer<typeof ApplyCreditInput>;
