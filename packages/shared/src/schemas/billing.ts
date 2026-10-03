import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDateTime } from "./common";

export const PaymentMethod = z.enum(["cash", "gcash", "maya", "card", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

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

/** Payments are append-only. Refunds are negative payments. */
export const Payment = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  invoiceId: Id,
  amount: Centavos,
  method: PaymentMethod,
  referenceNo: z.string().optional(),
  /** Why, on a refund. */
  note: z.string().optional(),
  /** Acknowledgment receipt number, AR-000001. Not a BIR official receipt (deferred). */
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
  .refine((p) => p.method === "cash" || !!p.referenceNo?.trim(), { message: "Enter the reference number", path: ["referenceNo"] })
  .refine((p) => p.amount > 0 || !!p.note?.trim(), { message: "Give a reason for the refund", path: ["note"] });
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;
