import { addDays, format, parseISO, subMonths } from "date-fns";
import { primolarInvoiceNo, subscriptionDueOn, subscriptionMonthLine, type Subscription, type SubscriptionPayment, type Tier } from "@pedia/shared";
import { DEMO_CLINIC_ID } from "./seed";
import { IPIN_ID } from "./seed-ipin";
import { NGITI_ID } from "./seed-ngiti";
import { SEED_PRICES } from "./seed-signups";

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The approval date whose `paidMonths`-th due date is `daysFromToday` from today. A month's end can clamp, so this is
 * the first anchor whose due date is on or after that day (at most a day late), never before it.
 */
function seedAnchor(daysFromToday: number, paidMonths: number): string {
  const target = isoDay(addDays(new Date(), daysFromToday));
  let anchor = subMonths(parseISO(target), paidMonths);
  while (subscriptionDueOn(isoDay(anchor), paidMonths) < target) anchor = addDays(anchor, 1);
  return isoDay(anchor);
}

/** Every month paid on its due date: the upfront payment first (S15), then one per month. */
function paidUp(clinicId: string, tier: Tier, paidMonths: number, daysToDue: number, firstInvoice: number): Subscription {
  const anchor = seedAnchor(daysToDue, paidMonths);
  const { setupFee, monthlyFee } = SEED_PRICES.plans[tier];
  const payments = Array.from({ length: paidMonths }, (_, m): SubscriptionPayment => {
    const periodStart = subscriptionDueOn(anchor, m);
    const lines =
      m === 0
        ? [{ label: "Setup fee", amount: setupFee }, { label: "First month", amount: monthlyFee }]
        : [{ label: subscriptionMonthLine(tier, periodStart), amount: monthlyFee }];
    return {
      id: `subpay_${clinicId}_${m + 1}`,
      invoiceNo: primolarInvoiceNo(firstInvoice + m),
      tier,
      periodStart,
      periodEnd: subscriptionDueOn(anchor, m + 1),
      lines,
      amount: lines.reduce((sum, l) => sum + l.amount, 0),
      method: m === 0 ? "bank_transfer" : "gcash",
      paidOn: periodStart,
      recordedAt: `${periodStart}T10:00:00.000+08:00`,
    };
  });
  return { clinicId, anchor, paidMonths, payments };
}

/**
 * Billing #34: Bulilit paid up (next due in about 12 days); Ngiti paid up and due in about 2 days (the reminder); Ipin
 * 3 days overdue (in grace, 4 days left). Invoices 1–14 across the three, in this order.
 */
export const seedSubscriptions = (): Subscription[] => [
  paidUp(DEMO_CLINIC_ID, "mid", 8, 12, 1),
  paidUp(NGITI_ID, "small", 4, 2, 9),
  paidUp(IPIN_ID, "small", 2, -3, 13),
];
