import { formatPeso, invoiceTotal, isVoided, rolesCan, type BillTotals, type Role } from "@pedia/shared";
import type { Refusal } from "../common/refusal";

/** The mock's refusals (features/billing/mocks.ts), pure, one test each. */
export const INVOICE_NOT_FOUND = "Invoice not found";
export const NOT_STAFF_NOW = "Choose someone who works here now";
const no = (status: Refusal["status"], message: string): Refusal => ({ status, message });

/** Decision 3: a negative amount is a refund, which needs billing.adjust. After the body, before the money. */
export const refundRefusal = (amount: number, roles: readonly Role[]) =>
  amount < 0 && !rolesCan(roles, "billing.adjust") ? no(403, "Only the Owner or an admin can record a refund") : undefined;

/** A bill lists each treatment once. */
export const duplicateRefusal = (ids: string[]) => (new Set(ids).size !== ids.length ? no(400, "A treatment is listed twice") : undefined);

/** Every id billable, and a discount within the subtotal (409 first, as the mock). */
export function invoiceRefusal(asked: string[], billable: string[], subtotal: number, discount: number): Refusal | undefined {
  if (asked.some((id) => !billable.includes(id))) return no(409, "Only this patient's completed, not yet billed treatments can be invoiced");
  if (discount > subtotal) return no(400, `The discount can't be more than ${formatPeso(subtotal)}`);
  return undefined;
}

/** The appointment a bill's items were done in, when they all share one; `of` maps visit → appointment. */
export function invoiceAppointment(visitIds: (string | undefined)[], of: Map<string, string | undefined>): string | undefined {
  const all = new Set(visitIds.map((v) => (v ? of.get(v) : undefined)));
  return all.size === 1 ? [...all][0] : undefined;
}

/** What a bill's payment rows add up to: everything, and the part that came from the deposit. */
export type Paid = { all: number; credit: number };

/** A payment or refund on a bill, plus decision 2's voided bill. */
export function paymentRefusal(invoice: BillTotals, paid: Paid, amount: number): Refusal | undefined {
  if (isVoided(invoice)) return no(409, "This bill was voided");
  const balance = invoiceTotal(invoice) - paid.all;
  const cash = paid.all - paid.credit; // an applied deposit goes back through apply-credit, never as a cash refund
  if (amount > balance) return no(409, `That's more than the ${formatPeso(balance)} balance`);
  if (-amount > cash) return no(409, `A refund can't be more than the ${formatPeso(cash)} paid`);
  return undefined;
}

/** A deposit refund within what is held. */
export const depositRefusal = (held: number, amount: number) =>
  -amount > held ? no(409, `A refund can't be more than the ${formatPeso(held)} deposit`) : undefined;

/** Moving deposit credit onto a bill or back, plus the voided bill. */
export function creditRefusal(invoice: BillTotals, paid: Paid, held: number, amount: number): Refusal | undefined {
  if (isVoided(invoice)) return no(409, "This bill was voided");
  const balance = invoiceTotal(invoice) - paid.all;
  if (amount > held) return no(409, `Only ${formatPeso(held)} is on deposit`);
  if (amount > balance) return no(409, `That's more than the ${formatPeso(balance)} balance`);
  if (-amount > paid.credit) return no(409, "That's more than was applied from the deposit");
  return undefined;
}

/** Decision 2 and its follow-up: only a bill no payment row ever touched can be voided, refunded or not. */
export function voidRefusal(invoice: Pick<BillTotals, "voided">, paymentRows: number): Refusal | undefined {
  if (isVoided(invoice)) return no(409, "This bill is already voided");
  if (paymentRows > 0) return no(409, "Only a bill with nothing paid or applied on it can be voided");
  return undefined;
}
