import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { PriceChange, PriceList } from "../schemas/signup";
import type { Subscription, SubscriptionPause, SubscriptionState } from "../schemas/subscription";
import { Tier, type AccountStatus } from "../schemas/tenancy";
import { TIER_LABEL, TIER_LIMITS } from "./tenancy";

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

type Sub = Pick<Subscription, "anchor" | "paidMonths" | "cancelledAt" | "downgrade" | "priceTier" | "pause">;

/** The first unpaid month's start: the next due date. */
export const unpaidFrom = (sub: Pick<Subscription, "anchor" | "paidMonths">) => subscriptionDueOn(sub.anchor, sub.paidMonths);

/**
 * Billing #27, S5: the plan the month starting `periodStart` is billed at: the plan in force when it began. An old
 * plan kept for months already running (`priceTier`), else a waiting downgrade once its date has come, else the
 * account's plan today.
 */
export function billedTier(sub: Sub, accountTier: Tier, periodStart = unpaidFrom(sub)): Tier {
  if (sub.priceTier && periodStart < sub.priceTier.until) return sub.priceTier.tier;
  if (sub.downgrade && periodStart >= sub.downgrade.on) return sub.downgrade.tier;
  return accountTier;
}

/** The first due date on or after `day`: where a plan change takes effect (billing #27). */
export function nextBoundary(sub: Pick<Subscription, "anchor" | "paidMonths">, day: string): string {
  let n = sub.paidMonths;
  while (subscriptionDueOn(sub.anchor, n) < day) n += 1;
  return subscriptionDueOn(sub.anchor, n);
}

/** Months that began before `until` and aren't paid keep `tier`'s price (billing #27): what to store, or undefined. */
export const keptPrice = (sub: Sub, tier: Tier, until: string): { tier: Tier; until: string } | undefined =>
  unpaidFrom(sub) < until && !sub.priceTier ? { tier, until } : undefined;

/**
 * B12 decision 11: the price list a month starting on `day` is billed at. Each change keeps the list in force before
 * its day; the first change after `day` (in saved order) holds that list. Two changes on one day: the first one's
 * `before` wins, the list in force when the day began.
 */
export function priceOn(changes: readonly PriceChange[], current: PriceList, day: string): PriceList {
  return changes.find((c) => day < c.on)?.before ?? current;
}

export const monthlyFeeOn = (changes: readonly PriceChange[], current: PriceList, tier: Tier, periodStart: string) =>
  priceOn(changes, current, periodStart).plans[tier].monthlyFee;

/** What one settle changes: `null` clears a field; `{}` means nothing to do (S2, B12 E5). */
export type SettlePatch = {
  tier?: Tier;
  status?: AccountStatus;
  pause?: SubscriptionPause | null;
  downgrade?: null;
  priceTier?: { tier: Tier; until: string } | null;
};

/**
 * S2: applies a downgrade whose date has come (billing #27), and pauses a clinic whose grace has run out (#28) or whose
 * cancelled month has ended (#30). Only an active clinic is paused, and only then is the cause recorded (S3), so a pause
 * made by hand is never taken for this one; its own pause that no longer applies is lifted. Pure: the mock applies it
 * per request, the API in its nightly job and at sign-in.
 */
export function settleStep(sub: Sub, account: { tier: Tier; status: AccountStatus }, day: string): SettlePatch {
  const patch: SettlePatch = {};
  let s = sub;
  if (s.downgrade && day >= s.downgrade.on) {
    const kept = keptPrice(s, account.tier, s.downgrade.on); // unpaid months from before the change keep the old price
    Object.assign(patch, { tier: s.downgrade.tier, downgrade: null }, kept ? { priceTier: kept } : {});
    s = { ...s, downgrade: undefined, priceTier: kept ?? s.priceTier };
  }
  if (s.priceTier && unpaidFrom(s) >= s.priceTier.until) patch.priceTier = null;
  const { state } = subscriptionStatus(s, day);
  const ownPause = state === "lapsed" || state === "ended";
  if (ownPause && account.status === "active") Object.assign(patch, { status: "suspended", pause: state === "lapsed" ? "overdue" : "cancelled" });
  else if (s.pause && !ownPause && account.status === "suspended") Object.assign(patch, { status: "active", pause: null });
  return patch;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** B12 decision 12: why a downgrade can't be scheduled while the clinic has more than the smaller plan allows. */
export function downgradeProblem(to: Tier, usage: { branches: number; staffLogins: number }): string | undefined {
  const { branches, staffLogins } = TIER_LIMITS[to];
  const fits = (branches === null || usage.branches <= branches) && (staffLogins === null || usage.staffLogins <= staffLogins);
  if (fits) return undefined;
  return `This clinic has ${plural(usage.branches, "open branch", "open branches")} and ${plural(usage.staffLogins, "staff login", "staff logins")}. The ${TIER_LABEL[to]} plan includes ${plural(branches ?? 0, "branch", "branches")} and ${plural(staffLogins ?? 0, "staff login", "staff logins")}: the Owner must archive branches or deactivate logins before the plan can go down.`;
}

/** B12 E13: while a downgrade waits, additions are checked against the smaller of the two plans. */
export const limitTier = (current: Tier, downgrade?: { tier: Tier } | null): Tier =>
  downgrade && Tier.options.indexOf(downgrade.tier) < Tier.options.indexOf(current) ? downgrade.tier : current;
