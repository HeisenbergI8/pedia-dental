import { addDays, addMonths, addWeeks, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import type { Appointment } from "../schemas/appointment";
import { MONEY_METHODS, type Invoice, type Payment, type PaymentMethod } from "../schemas/billing";
import type { FinanceSummary } from "../schemas/finance";
import { accountSummary, depositBalance, invoiceBalance, isMoneyIn, liveInvoices } from "./money";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** The clinic-local day of a timestamp, the same rule as GET /payments?date=. */
const dayOf = (iso: string) => ymd(new Date(iso));
const WEEK = { weekStartsOn: 1 } as const; // Monday

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

type Inputs = {
  invoices: Invoice[];
  payments: Payment[];
  appointments: Pick<Appointment, "id" | "patientId" | "startsAt" | "reason" | "status">[];
};

/** "Unpaid appointments" covers done appointments from this day to today. */
export const unpaidSince = (today: string) => ymd(subDays(parseISO(today), 30));

/**
 * The days a summary for `today` reads collections from: the earliest bucket's start (6 months, 8 weeks, 14 days) to
 * the latest bucket's end (this month's or this week's last day). Asked about a past day, the current month's and
 * week's bars still count their whole span, as the series always have.
 */
export function financeWindow(today: string): { from: string; to: string } {
  const t = parseISO(today);
  const starts = [addMonths(startOfMonth(t), -5), addWeeks(startOfWeek(t, WEEK), -7), subDays(t, 13)];
  const ends = [subDays(addMonths(startOfMonth(t), 1), 1), subDays(addWeeks(startOfWeek(t, WEEK), 1), 1), t];
  return { from: ymd(new Date(Math.min(...starts.map(Number)))), to: ymd(new Date(Math.max(...ends.map(Number)))) };
}

/**
 * The sums the dashboard is built from (B8 E7). The mock computes them from rows here; the API from aggregate
 * queries. Lists are in any order: summarizeFinance sorts. Voided bills are in none of them.
 */
export type FinanceFacts = {
  /** Real money (not account_credit) per clinic day and method, net of refunds. */
  collected: { day: string; method: PaymentMethod; amount: number }[];
  /** Live bills issued from the month's start to today: their lines per procedure, and their discounts. */
  revenue: { procedureCode: string; amount: number; count: number }[];
  discounts: number;
  /** Every patient with a live bill: billed less paid on those bills (can be 0 or below). */
  balances: { patientId: string; balance: number }[];
  /** Every patient with deposit rows: what they add up to. */
  deposits: { patientId: string; held: number }[];
  /** Done appointments from unpaidSince(today) to today; billed ones carry their earliest live bill and its balance. */
  done: { appointmentId: string; patientId: string; startsAt: string; reason: string; invoiceId?: string; balance?: number }[];
};

const byIssued = (a: Invoice, b: Invoice) => a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id);

export function financeFacts({ invoices, payments, appointments }: Inputs, today: string): FinanceFacts {
  const live = liveInvoices(invoices);
  const monthStart = ymd(startOfMonth(parseISO(today)));
  const inMonth = (iso: string) => dayOf(iso) >= monthStart && dayOf(iso) <= today;

  // Real money only: applying a deposit to an invoice moves money already counted on the day it was received.
  const collected = new Map<string, FinanceFacts["collected"][number]>();
  for (const p of payments.filter(isMoneyIn)) {
    const day = dayOf(p.receivedAt);
    const row = collected.get(`${day} ${p.method}`) ?? { day, method: p.method, amount: 0 };
    collected.set(`${day} ${p.method}`, { ...row, amount: row.amount + p.amount });
  }
  const monthInvoices = live.filter((i) => inMonth(i.issuedAt));
  const revenue = new Map<string, FinanceFacts["revenue"][number]>();
  for (const line of monthInvoices.flatMap((i) => i.lines)) {
    const r = revenue.get(line.procedureCode) ?? { procedureCode: line.procedureCode, amount: 0, count: 0 };
    revenue.set(line.procedureCode, { ...r, amount: r.amount + line.amount, count: r.count + 1 });
  }
  // Not Map.groupBy: packages/shared compiles against lib ES2022 (tsconfig.base.json).
  const balances = [...new Set(live.map((i) => i.patientId))].map((patientId) => ({
    patientId,
    balance: accountSummary(live.filter((i) => i.patientId === patientId), payments).balance,
  }));
  const deposits = [...new Set(payments.filter((p) => !p.invoiceId).map((p) => p.patientId))].map((patientId) => ({
    patientId,
    held: depositBalance(payments, patientId),
  }));
  const since = unpaidSince(today);
  const done = appointments
    .filter((a) => a.status === "done" && dayOf(a.startsAt) >= since && dayOf(a.startsAt) <= today)
    .map((a) => {
      const row = { appointmentId: a.id, patientId: a.patientId, startsAt: a.startsAt, reason: a.reason };
      const invoice = live.filter((i) => i.appointmentId === a.id).sort(byIssued)[0]; // the first bill decides (B8 question 5)
      return invoice ? { ...row, invoiceId: invoice.id, balance: invoiceBalance(invoice, payments) } : row;
    });
  return { collected: [...collected.values()], revenue: [...revenue.values()], discounts: sum(monthInvoices.map((i) => ({ amount: i.discount }))), balances, deposits, done };
}

/** Feature 8's numbers from the facts. Ties are broken by id, so the mock and SQL agree on order (B8 E7). */
export function summarizeFinance(f: FinanceFacts, today: string): FinanceSummary {
  const t = parseISO(today);
  const monthStart = ymd(startOfMonth(t));
  const between = (from: string, to: string) => sum(f.collected.filter((c) => c.day >= from && c.day <= to));
  const series = (starts: Date[], next: (d: Date) => Date) =>
    starts.map((d) => ({ start: ymd(d), amount: between(ymd(d), ymd(subDays(next(d), 1))) }));
  const outstanding = f.balances
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.patientId.localeCompare(b.patientId));
  return {
    today,
    collected: { today: between(today, today), week: between(ymd(startOfWeek(t, WEEK)), today), month: between(monthStart, today) },
    byDay: series(Array.from({ length: 14 }, (_, i) => subDays(t, 13 - i)), (d) => addDays(d, 1)),
    byWeek: series(Array.from({ length: 8 }, (_, i) => addWeeks(startOfWeek(t, WEEK), i - 7)), (d) => addWeeks(d, 1)),
    byMonth: series(Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(t), i - 5)), (d) => addMonths(d, 1)),
    byMethod: MONEY_METHODS.map((method) => ({ method, amount: sum(f.collected.filter((c) => c.method === method && c.day >= monthStart && c.day <= today)) })),
    revenueByProcedure: [...f.revenue].sort((a, b) => b.amount - a.amount || a.procedureCode.localeCompare(b.procedureCode)),
    discounts: f.discounts,
    outstanding,
    outstandingTotal: sum(outstanding.map((r) => ({ amount: r.balance }))),
    // Deposits not yet applied: owed to parents until used, so they're not netted against outstanding balances.
    depositsHeld: f.deposits.reduce((s, d) => s + Math.max(0, d.held), 0),
    unpaidAppointments: f.done
      .filter((d) => d.balance === undefined || d.balance > 0)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.appointmentId.localeCompare(b.appointmentId)),
  };
}

/** Feature 8's numbers, computed on every call from invoices, payments and appointments. `today` is YYYY-MM-DD. */
export const financeSummary = (inputs: Inputs, today: string): FinanceSummary => summarizeFinance(financeFacts(inputs, today), today);
