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
