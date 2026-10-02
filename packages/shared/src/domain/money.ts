import type { Invoice, Payment } from "../schemas/billing";

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
