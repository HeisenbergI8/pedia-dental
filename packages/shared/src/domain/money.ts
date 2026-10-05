import type { Invoice, Payment } from "../schemas/billing";
import type { PlanItem } from "../schemas/plan";

export const pesos = (php: number) => Math.round(php * 100);

export function formatPeso(centavos: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
}

export function invoiceTotal(inv: Pick<Invoice, "lines" | "discount">): number {
  return inv.lines.reduce((sum, l) => sum + l.amount, 0) - inv.discount;
}

/** Balance is computed, never stored. */
export function invoiceBalance(inv: Pick<Invoice, "id" | "lines" | "discount">, payments: Payment[]): number {
  const paid = payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
  return invoiceTotal(inv) - paid;
}

/** Done plan items that no invoice line bills yet: what can go on the next invoice. */
export function unbilledItems(items: PlanItem[], invoices: Pick<Invoice, "lines">[]): PlanItem[] {
  const billed = new Set(invoices.flatMap((inv) => inv.lines.map((l) => l.planItemId)));
  return items.filter((i) => i.status === "done" && !billed.has(i.id));
}

/** A patient's account across invoices. Built on invoiceBalance, so it always agrees with each invoice. */
export function accountSummary(invoices: Pick<Invoice, "id" | "lines" | "discount">[], payments: Payment[]) {
  const total = invoices.reduce((s, inv) => s + invoiceTotal(inv), 0);
  const balance = invoices.reduce((s, inv) => s + invoiceBalance(inv, payments), 0);
  return { total, paid: total - balance, balance };
}

/**
 * Money received beyond what was billed, invoice by invoice. Computed, never stored. Always 0 while payments and
 * deposit applications are capped at the balance; money held before billing is `depositBalance`.
 */
export function accountCredit(invoices: Pick<Invoice, "id" | "lines" | "discount">[], payments: Payment[]): number {
  return invoices.reduce((s, inv) => s + Math.max(0, -invoiceBalance(inv, payments)), 0);
}

/** Real money in or out (cash, GCash, card…), not a transfer between a deposit and an invoice. Collections count these. */
export const isMoneyIn = (p: Pick<Payment, "method">) => p.method !== "account_credit";

/** Money held on a patient's account: deposits, less deposit refunds and what was applied. Computed, never stored. */
export function depositBalance(payments: Pick<Payment, "patientId" | "invoiceId" | "amount">[], patientId: string): number {
  return payments.filter((p) => p.patientId === patientId && !p.invoiceId).reduce((s, p) => s + p.amount, 0);
}

/** Deposit money applied to one invoice so far (what can be moved back to the deposit). */
export function appliedCredit(invoiceId: string, payments: Pick<Payment, "invoiceId" | "method" | "amount">[]): number {
  return payments.filter((p) => p.invoiceId === invoiceId && p.method === "account_credit").reduce((s, p) => s + p.amount, 0);
}
