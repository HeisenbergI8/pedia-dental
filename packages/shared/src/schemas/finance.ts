import { z } from "zod";
import { PaymentMethod } from "./billing";
import { Centavos, Id, IsoDate, IsoDateTime } from "./common";

const Bucket = z.object({ start: IsoDate, amount: Centavos }); // net collections from `start` to the next bucket

/** The admin dashboard (feature 8). Every number is computed from invoices, payments and appointments by financeSummary. */
export const FinanceSummary = z.object({
  today: IsoDate,
  collected: z.object({ today: Centavos, week: Centavos, month: Centavos }), // net of refunds; weeks start Monday
  byDay: z.array(Bucket), // the last 14 days, oldest first
  byWeek: z.array(Bucket), // the last 8 weeks
  byMonth: z.array(Bucket), // the last 6 months
  byMethod: z.array(z.object({ method: PaymentMethod, amount: Centavos })), // this month, every method
  revenueByProcedure: z.array(z.object({ procedureCode: z.string(), amount: Centavos, count: z.number().int() })), // invoiced this month, largest first, before discounts
  discounts: Centavos, // given on invoices issued this month
  outstanding: z.array(z.object({ patientId: Id, balance: Centavos })), // largest first
  outstandingTotal: Centavos,
  depositsHeld: Centavos, // unapplied deposits across patients, shown apart from outstanding
  unpaidAppointments: z.array(
    z.object({ appointmentId: Id, patientId: Id, startsAt: IsoDateTime, reason: z.string(), invoiceId: Id.optional(), balance: Centavos.optional() }),
  ), // done in the last 30 days and not billed (no invoiceId) or not fully paid; newest first
});
export type FinanceSummary = z.infer<typeof FinanceSummary>;
