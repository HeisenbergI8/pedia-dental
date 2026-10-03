import { addDays, addMonths, addWeeks, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns";
import type { Appointment } from "../schemas/appointment";
import { PaymentMethod, type Invoice, type Payment } from "../schemas/billing";
import type { FinanceSummary } from "../schemas/finance";
import { accountSummary, invoiceBalance } from "./money";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** The clinic-local day of a timestamp, the same rule as GET /payments?date=. */
const dayOf = (iso: string) => ymd(new Date(iso));
const WEEK = { weekStartsOn: 1 } as const; // Monday

type Inputs = {
  invoices: Invoice[];
  payments: Payment[];
  appointments: Pick<Appointment, "id" | "patientId" | "startsAt" | "reason" | "status">[];
};

/** Feature 8's numbers, computed on every call from invoices, payments and appointments. `today` is YYYY-MM-DD. */
export function financeSummary({ invoices, payments, appointments }: Inputs, today: string): FinanceSummary {
  const t = parseISO(today);
  const monthStart = ymd(startOfMonth(t));
  const collectedBetween = (from: string, to: string) =>
    payments.filter((p) => dayOf(p.receivedAt) >= from && dayOf(p.receivedAt) <= to).reduce((s, p) => s + p.amount, 0);
  const series = (starts: Date[], next: (d: Date) => Date) =>
    starts.map((d) => ({ start: ymd(d), amount: collectedBetween(ymd(d), ymd(subDays(next(d), 1))) }));
  const inMonth = (iso: string) => dayOf(iso) >= monthStart && dayOf(iso) <= today;

  const revenue = new Map<string, { amount: number; count: number }>();
  const monthInvoices = invoices.filter((i) => inMonth(i.issuedAt));
  for (const line of monthInvoices.flatMap((i) => i.lines)) {
    const r = revenue.get(line.procedureCode) ?? { amount: 0, count: 0 };
    revenue.set(line.procedureCode, { amount: r.amount + line.amount, count: r.count + 1 });
  }

  // Not Map.groupBy: packages/shared compiles against lib ES2022 (tsconfig.base.json).
  const patientIds = [...new Set(invoices.map((i) => i.patientId))];
  const outstanding = patientIds
    .map((patientId) => ({ patientId, balance: accountSummary(invoices.filter((i) => i.patientId === patientId), payments).balance }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const since = ymd(subDays(t, 30));
  const unpaidAppointments = appointments
    .filter((a) => a.status === "done" && dayOf(a.startsAt) >= since && dayOf(a.startsAt) <= today)
    .flatMap((a) => {
      const row = { appointmentId: a.id, patientId: a.patientId, startsAt: a.startsAt, reason: a.reason };
      const invoice = invoices.find((i) => i.appointmentId === a.id);
      if (!invoice) return [row]; // not billed yet
      const balance = invoiceBalance(invoice, payments);
      return balance > 0 ? [{ ...row, invoiceId: invoice.id, balance }] : [];
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return {
    today,
    collected: {
      today: collectedBetween(today, today),
      week: collectedBetween(ymd(startOfWeek(t, WEEK)), today),
      month: collectedBetween(monthStart, today),
    },
    byDay: series(Array.from({ length: 14 }, (_, i) => subDays(t, 13 - i)), (d) => addDays(d, 1)),
    byWeek: series(Array.from({ length: 8 }, (_, i) => addWeeks(startOfWeek(t, WEEK), i - 7)), (d) => addWeeks(d, 1)),
    byMonth: series(Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(t), i - 5)), (d) => addMonths(d, 1)),
    byMethod: PaymentMethod.options.map((method) => ({
      method,
      amount: payments.filter((p) => p.method === method && inMonth(p.receivedAt)).reduce((s, p) => s + p.amount, 0),
    })),
    revenueByProcedure: [...revenue].map(([procedureCode, r]) => ({ procedureCode, ...r })).sort((a, b) => b.amount - a.amount),
    discounts: monthInvoices.reduce((s, i) => s + i.discount, 0),
    outstanding,
    outstandingTotal: outstanding.reduce((s, r) => s + r.balance, 0),
    unpaidAppointments,
  };
}
