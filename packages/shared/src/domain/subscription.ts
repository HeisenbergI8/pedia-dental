import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Subscription, SubscriptionState } from "../schemas/subscription";
import { Tier } from "../schemas/tenancy";
import { TIER_LABEL } from "./tenancy";

/** Billing #28: days after the due date before the clinic is paused. */
export const GRACE_DAYS = 7;
/** Billing #32: "due in 3 days" starts this many days before the due date (S4). */
export const DUE_REMINDER_DAYS = 3;

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

/** "30 September 2026": how billing dates read on screens and invoices. */
export const formatBillingDate = (iso: string) => format(parseISO(iso), "d MMMM yyyy");

/**
 * Billing #26: the due date `months` months after the anchor. Counted from the anchor every time, never from the last
 * due date, so an approval on the 31st is due on 30 September and then on 31 October again (date-fns clamps to the
 * month's last day).
 */
export const subscriptionDueOn = (anchor: string, months: number) => isoDay(addMonths(parseISO(anchor), months));

export type SubscriptionStanding = { state: SubscriptionState; nextDue: string; payBy: string; daysUntilDue: number };

/** Where a subscription stands on `today` (S4): the state, the next due date, the last day of grace. */
export function subscriptionStatus(sub: Pick<Subscription, "anchor" | "paidMonths" | "cancelledAt">, today: string): SubscriptionStanding {
  const nextDue = subscriptionDueOn(sub.anchor, sub.paidMonths);
  const payBy = isoDay(addDays(parseISO(nextDue), GRACE_DAYS));
  const daysUntilDue = differenceInCalendarDays(parseISO(nextDue), parseISO(today));
  let state: SubscriptionState;
  if (sub.cancelledAt) state = daysUntilDue > 0 ? "ending" : "ended"; // billing #30: at the paid month's end, no grace
  else if (daysUntilDue > DUE_REMINDER_DAYS) state = "paid";
  else if (daysUntilDue >= 0) state = "due_soon";
  else if (daysUntilDue >= -GRACE_DAYS) state = "overdue";
  else state = "lapsed";
  return { state, nextDue, payBy, daysUntilDue };
}

/** The in-app reminder (billing #32), or undefined when there is nothing to say. Owner-only wherever it shows (#31). */
export function subscriptionReminder(s: Pick<SubscriptionStanding, "state" | "nextDue" | "payBy" | "daysUntilDue">): string | undefined {
  if (s.state === "due_soon") {
    if (s.daysUntilDue === 0) return "Your Primolar payment is due today.";
    return `Your Primolar payment is due in ${s.daysUntilDue} day${s.daysUntilDue === 1 ? "" : "s"}, on ${formatBillingDate(s.nextDue)}.`;
  }
  if (s.state === "overdue") return `Your Primolar payment is overdue. Pay by ${formatBillingDate(s.payBy)} to keep your clinic running.`;
  return undefined;
}

export const SUBSCRIPTION_STATE_LABEL: Record<SubscriptionState, string> = {
  paid: "Paid up",
  due_soon: "Due soon",
  overdue: "Overdue, in grace",
  lapsed: "Paused for non-payment",
  ending: "Cancelled, ends with the paid month",
  ended: "Cancelled and paused",
};

/** S10: one sequence across the platform. */
export const primolarInvoiceNo = (n: number) => `PRM-INV-${String(n).padStart(5, "0")}`;

/** S15: a monthly invoice's one line. */
export const subscriptionMonthLine = (tier: Tier, periodStart: string) =>
  `Primolar ${TIER_LABEL[tier]} plan, month from ${formatBillingDate(periodStart)}`;

/** Billing #27: an upgrade applies at once, a downgrade on the next due date. Plans are ordered as `Tier` lists them. */
export const isTierUpgrade = (from: Tier, to: Tier) => Tier.options.indexOf(to) > Tier.options.indexOf(from);
