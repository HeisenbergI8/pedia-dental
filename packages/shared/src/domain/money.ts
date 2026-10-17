import type { Invoice, InvoiceLine, Payment } from "../schemas/billing";
import type { PlanItem } from "../schemas/plan";

export const pesos = (php: number) => Math.round(php * 100);

export function formatPeso(centavos: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(centavos / 100);
}

/**
 * What the money rules read from a bill and a payment. Narrow on purpose: the API feeds them aggregate rows (a bill's
 * line sum as one line, a bill's payments as one row; B8 E8) without inventing descriptions or receipt numbers.
 */
export type BillTotals = Pick<Invoice, "id" | "discount" | "voided"> & { lines: Pick<InvoiceLine, "amount">[] };
export type PaidRow = Pick<Payment, "invoiceId" | "amount">;

/** A voided bill (B8 decision 2) stays on record but bills nothing: no balance, no billed treatments, in no total. */
export const isVoided = (inv: Pick<Invoice, "voided">) => !!inv.voided;
export const liveInvoices = <T extends Pick<Invoice, "voided">>(invoices: T[]): T[] => invoices.filter((i) => !isVoided(i));

export function invoiceTotal(inv: Pick<BillTotals, "lines" | "discount">): number {
  return inv.lines.reduce((sum, l) => sum + l.amount, 0) - inv.discount;
}

/** Balance is computed, never stored. A voided bill owes nothing: nothing is ever paid on one (the void rule). */
export function invoiceBalance(inv: BillTotals, payments: PaidRow[]): number {
  if (isVoided(inv)) return 0;
  const paid = payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
  return invoiceTotal(inv) - paid;
}

/** Done plan items that no live bill's line bills: what can go on the next bill. A voided bill frees its items. */
export function unbilledItems(items: PlanItem[], invoices: Pick<Invoice, "lines" | "voided">[]): PlanItem[] {
  const billed = new Set(liveInvoices(invoices).flatMap((inv) => inv.lines.map((l) => l.planItemId)));
  return items.filter((i) => i.status === "done" && !billed.has(i.id));
}

/** A patient's account across live bills. Built on invoiceBalance, so it always agrees with each bill. */
export function accountSummary(invoices: BillTotals[], payments: PaidRow[]) {
  const live = liveInvoices(invoices);
  const total = live.reduce((s, inv) => s + invoiceTotal(inv), 0);
  const balance = live.reduce((s, inv) => s + invoiceBalance(inv, payments), 0);
  return { total, paid: total - balance, balance };
}

/**
 * Money received beyond what was billed, invoice by invoice. Computed, never stored. Always 0 while payments and
 * deposit applications are capped at the balance; money held before billing is `depositBalance`.
 */
export function accountCredit(invoices: BillTotals[], payments: PaidRow[]): number {
  return liveInvoices(invoices).reduce((s, inv) => s + Math.max(0, -invoiceBalance(inv, payments)), 0);
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

type DepositRow = Pick<Payment, "patientId" | "invoiceId" | "appliedTo" | "branchId" | "amount">;

/**
 * What a credit move can draw on, per branch, in the order the branches first appear in `payments` (received order):
 * moving onto the bill (+), what each branch holds on deposit for the patient; moving back (−), what each branch gave
 * this bill. Was the first half of `depositSide` in billing/mocks.ts (B8 E10).
 */
export function depositPool(payments: DepositRow[], patientId: string, invoiceId: string, amount: number): [string, number][] {
  const mine = payments.filter((p) => p.patientId === patientId && !p.invoiceId);
  const rows = amount > 0 ? mine : mine.filter((p) => p.appliedTo === invoiceId);
  const sums = new Map<string, number>();
  for (const p of rows) sums.set(p.branchId, (sums.get(p.branchId) ?? 0) + (amount > 0 ? p.amount : -p.amount));
  return [...sums];
}

/**
 * Where moving `amount` of deposit onto (+) or off (−) a bill lands on the deposit side, so each branch's "deposits
 * held" stays true: the bill's own branch first, then the pool's order. Rows are [branchId, signed amount].
 */
export function depositLegs(invoiceBranchId: string, pool: [string, number][], amount: number): [string, number][] {
  const held = new Map(pool);
  const order = [invoiceBranchId, ...pool.map(([b]) => b).filter((b) => b !== invoiceBranchId)];
  const rows: [string, number][] = [];
  let left = Math.abs(amount);
  for (const b of order) {
    const take = Math.min(left, Math.max(0, held.get(b) ?? 0));
    if (take > 0) rows.push([b, amount > 0 ? -take : take]);
    left -= take;
  }
  return rows;
}
