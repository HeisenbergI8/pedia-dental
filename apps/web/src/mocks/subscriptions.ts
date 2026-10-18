import {
  isTierUpgrade,
  primolarInvoiceNo,
  subscriptionDueOn,
  subscriptionMonthLine,
  subscriptionStatus,
  vatPart,
  type RecordUpfrontPaymentInput,
  type Signup,
  type Subscription,
  type SubscriptionPayment,
  type SubscriptionView,
  type Tier,
} from "@pedia/shared";
import { today } from "./clock";
import { accountById, persist, platform } from "./db";

/**
 * Billing #25–#30: one subscription per clinic, in `Platform.subscriptions`. Everything here reads the platform, never
 * the per-request tenant binding or a session (mocks/operator.test.ts guards this file).
 */
export const subscriptionOf = (clinicId: string): Subscription | undefined => platform.subscriptions.find((s) => s.clinicId === clinicId);

const nextInvoiceNo = () => primolarInvoiceNo(platform.subscriptions.reduce((n, s) => n + s.payments.length, 0) + 1);

const monthlyFee = (tier: Tier) => platform.prices.plans[tier].monthlyFee;
/** The first unpaid month's start: the next due date. */
const unpaidFrom = (sub: Subscription) => subscriptionDueOn(sub.anchor, sub.paidMonths);

/**
 * Billing #27, S5: the plan the month starting `periodStart` is billed at: the plan in force when it began. An old
 * plan kept for months already running (`priceTier`), else a waiting downgrade once its date has come, else today's.
 */
function billedTier(sub: Subscription, periodStart = unpaidFrom(sub)): Tier {
  if (sub.priceTier && periodStart < sub.priceTier.until) return sub.priceTier.tier;
  if (sub.downgrade && periodStart >= sub.downgrade.on) return sub.downgrade.tier;
  return accountById(sub.clinicId)!.tier;
}

/** The first due date on or after `day`: where a plan change takes effect (billing #27). */
function nextBoundary(sub: Subscription, day: string): string {
  let n = sub.paidMonths;
  while (subscriptionDueOn(sub.anchor, n) < day) n += 1;
  return subscriptionDueOn(sub.anchor, n);
}

/** Months that began before `until` and aren't paid yet keep `tier`'s price (billing #27: no repricing a running month). */
function keepPriceFor(sub: Subscription, tier: Tier, until: string) {
  if (unpaidFrom(sub) < until && !sub.priceTier) sub.priceTier = { tier, until };
}

/** A real timestamp on the mock's day, so dates shown from it follow the demo clock (S1). */
const stampToday = () => `${today()}T${new Date().toISOString().slice(11)}`;

/**
 * S2: runs at the top of the access gate on every request. Applies a downgrade whose date has come (billing #27), and
 * pauses a clinic whose grace has run out (#28) or whose cancelled month has ended (#30), with the existing pause
 * (`status: "suspended"`: staff out, parents read-only; platform #26, #41, #44). Only an active clinic is paused here,
 * and only then is the cause recorded (S3), so a pause the operator made by hand is never taken for this one.
 * NestJS: a daily job, plus the same check at sign-in.
 */
export function settleSubscriptions(day = today()): void {
  let changed = false;
  for (const sub of platform.subscriptions) {
    const account = accountById(sub.clinicId);
    if (!account) continue;
    if (sub.downgrade && day >= sub.downgrade.on) {
      keepPriceFor(sub, account.tier, sub.downgrade.on); // months still unpaid from before the change stay at the old price
      account.tier = sub.downgrade.tier;
      delete sub.downgrade;
      changed = true;
    }
    if (sub.priceTier && unpaidFrom(sub) >= sub.priceTier.until) {
      delete sub.priceTier;
      changed = true;
    }
    const { state } = subscriptionStatus(sub, day);
    if ((state === "lapsed" || state === "ended") && account.status === "active") {
      account.status = "suspended";
      sub.pause = state === "lapsed" ? "overdue" : "cancelled";
      changed = true;
    } else if (sub.pause && state !== "lapsed" && state !== "ended" && account.status === "suspended") {
      // Its own pause no longer applies (the demo clock moved back): lift it. A manual pause has no `pause` and stays.
      account.status = "active";
      delete sub.pause;
      changed = true;
    }
  }
  if (changed) persist();
}

/**
 * Billing #24, #26, S12, S13: a new clinic's subscription, anchored today, with its upfront payment as its first
 * invoice (setup fee, first month, design add-on). Called by `createClinic`; its callers have checked the payment.
 */
export function startSubscription(signup: Signup, clinicId: string): void {
  const anchor = today();
  const { quote, payment } = signup;
  if (!payment) throw new Error(`startSubscription: ${signup.id} has no upfront payment`); // never a free first month
  const lines = [
    { label: "Setup fee", amount: quote.setupFee },
    { label: "First month", amount: quote.firstMonth },
    ...(quote.designAddOn ? [{ label: "Design it for me", amount: quote.designAddOn }] : []),
  ];
  const first: SubscriptionPayment[] = [
    { ...payment, id: `subpay_${crypto.randomUUID()}`, invoiceNo: nextInvoiceNo(), tier: signup.account.tier, periodStart: anchor, periodEnd: subscriptionDueOn(anchor, 1), lines },
  ];
  platform.subscriptions.push({ clinicId, anchor, paidMonths: 1, payments: first });
}

/**
 * Billing #29, S5: one month, at the fee for the plan it is billed at. The schedule moves by `paidMonths`, never by the
 * date paid, so a late payment keeps the original due dates. It lifts a pause this subscription caused, at once, once
 * the clinic is back within grace; a pause made by hand stays (S3). Returns why it can't, or undefined.
 */
export function recordSubscriptionPayment(clinicId: string, input: RecordUpfrontPaymentInput): string | undefined {
  const sub = subscriptionOf(clinicId)!;
  const account = accountById(clinicId)!;
  if (sub.cancelledAt) return "This subscription is cancelled, so Primolar records no more payments for it.";
  const periodStart = unpaidFrom(sub);
  const tier = billedTier(sub, periodStart);
  const amount = monthlyFee(tier);
  sub.payments.push({
    ...input,
    id: `subpay_${crypto.randomUUID()}`,
    invoiceNo: nextInvoiceNo(),
    tier,
    periodStart,
    periodEnd: subscriptionDueOn(sub.anchor, sub.paidMonths + 1),
    lines: [{ label: subscriptionMonthLine(tier, periodStart), amount }],
    amount,
    recordedAt: new Date().toISOString(),
  });
  sub.paidMonths += 1;
  if (sub.pause === "overdue" && subscriptionStatus(sub, today()).state !== "lapsed") {
    account.status = "active";
    delete sub.pause;
  }
  persist();
  return undefined;
}

/**
 * Billing #27, S6: an upgrade now; a downgrade on the next due date; the current plan drops a waiting downgrade. A
 * month already running (an overdue one) keeps the price it began with. Returns why it can't, or undefined.
 */
export function changePlan(clinicId: string, tier: Tier): string | undefined {
  const sub = subscriptionOf(clinicId)!;
  const account = accountById(clinicId)!;
  if (sub.cancelledAt) return "This subscription is cancelled, so its plan no longer changes.";
  const boundary = nextBoundary(sub, today());
  if (isTierUpgrade(account.tier, tier)) {
    keepPriceFor(sub, account.tier, boundary);
    account.tier = tier;
    delete sub.downgrade;
  } else if (tier === account.tier) delete sub.downgrade;
  else sub.downgrade = { tier, on: boundary };
  persist();
  return undefined;
}

/** Billing #30, S7: the clinic pauses when the paid month ends; nothing is deleted. Returns why it can't, or undefined. */
export function cancelSubscription(clinicId: string): string | undefined {
  const sub = subscriptionOf(clinicId)!;
  if (sub.cancelledAt) return "This subscription is already cancelled.";
  sub.cancelledAt = stampToday();
  delete sub.downgrade;
  persist();
  settleSubscriptions(); // a month that has already ended pauses now, not on the next request
  return undefined;
}

/** S3: why the operator's Reactivate can't work now (the next request would pause it again), or undefined. */
export function reactivateRefusal(clinicId: string): string | undefined {
  const sub = subscriptionOf(clinicId);
  const state = sub && subscriptionStatus(sub, today()).state;
  if (state === "lapsed") return "This clinic's Primolar payment is past its grace period. Record the payment to reactivate it.";
  if (state === "ended") return "This clinic's subscription is cancelled and its paid month has ended.";
  return undefined;
}

/** A manual reactivation, once reactivateRefusal allows it, also clears a subscription pause. */
export function forgetPause(clinicId: string): void {
  const sub = subscriptionOf(clinicId);
  if (sub) delete sub.pause;
}

/** S14: what the Owner and the console both see. Newest payment first. */
export function subscriptionView(clinicId: string): SubscriptionView {
  const sub = subscriptionOf(clinicId)!;
  const account = accountById(clinicId)!;
  const { state, nextDue, payBy, daysUntilDue } = subscriptionStatus(sub, today());
  const nextTier = billedTier(sub);
  const nextAmount = monthlyFee(nextTier);
  return {
    clinicId,
    billedTo: { name: account.name, tin: account.tin, contactEmail: account.contactEmail },
    tier: account.tier,
    nextTier,
    downgrade: sub.downgrade ?? null,
    state,
    nextDue,
    payBy,
    daysUntilDue,
    nextAmount,
    nextVat: vatPart(nextAmount),
    cancelledAt: sub.cancelledAt ?? null,
    pausedFor: sub.pause ?? null,
    payments: [...sub.payments].reverse(),
    receipts: [], // B12 Step 1.3 stopgap: Step 2.2 fills these
    paymentQr: null,
    today: today(),
  };
}
