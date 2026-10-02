import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDateTime } from "./common";

export const PaymentMethod = z.enum(["cash", "gcash", "maya", "card", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const InvoiceLine = z.object({
  procedureCode: z.string(),
  description: z.string(),
  tooth: z.number().int().optional(),
  amount: Centavos,
});

export const Invoice = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id.optional(),
  lines: z.array(InvoiceLine).min(1),
  discount: Centavos.default(0),
  issuedAt: IsoDateTime,
});
export type Invoice = z.infer<typeof Invoice>;

/** Payments are append-only. Refunds are negative payments. */
export const Payment = ClinicScoped.extend({
  id: Id,
  invoiceId: Id,
  amount: Centavos,
  method: PaymentMethod,
  referenceNo: z.string().optional(),
  receivedBy: Id,
  receivedAt: IsoDateTime,
});
export type Payment = z.infer<typeof Payment>;
