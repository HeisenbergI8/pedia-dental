import {
  accountUsage,
  billedTier as billedTierOf,
  downgradeProblem,
  isTierUpgrade,
  keptPrice,
  monthlyFeeOn,
  nextBoundary,
  settleStep,
  unpaidFrom,
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
  rolesCan,
  type Role,
  type Tier,
} from "@pedia/shared";
import { today } from "./clock";
import { accountById, persist, platform } from "./db";
import { paymentQrView, receiptsOfClinic } from "./receipts";

/**
 * Billing #25–#30: one subscription per clinic, in `Platform.subscriptions`. Everything here reads the platform, never
 * the per-request tenant binding or a session (mocks/operator.test.ts guards this file).
 */
export const subscriptionOf = (clinicId: string): Subscription | undefined => platform.subscriptions.find((s) => s.clinicId === clinicId);

const nextInvoiceNo = () => primolarInvoiceNo(platform.subscriptions.reduce((n, s) => n + s.payments.length, 0) + 1);

/** B12 decision 11: a month is billed at the price list in force when it began (`priceOn`). */
const monthlyFee = (tier: Tier, periodStart: string) => monthlyFeeOn(platform.priceChanges, platform.prices, tier, periodStart);
const billedTier = (sub: Subscription, periodStart?: string) => billedTierOf(sub, accountById(sub.clinicId)!.tier, periodStart);

/** Months that began before `until` and aren't paid yet keep `tier`'s price (billing #27: no repricing a running month). */
function keepPriceFor(sub: Subscription, tier: Tier, until: string) {
  const kept = keptPrice(sub, tier, until);
  if (kept) sub.priceTier = kept;
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
    // The shared rule (B12 E5): the API applies the same patch in its nightly job and at sign-in.
    const { tier, status, pause, downgrade, priceTier } = settleStep(sub, account, day);
    if (tier) account.tier = tier;
    if (status) account.status = status;
    if (pause === null) delete sub.pause;
    else if (pause) sub.pause = pause;
    if (downgrade === null) delete sub.downgrade;
    if (priceTier === null) delete sub.priceTier;
    else if (priceTier) sub.priceTier = priceTier;
    changed ||= [tier, status, pause, downgrade, priceTier].some((v) => v !== undefined);
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
  const amount = monthlyFee(tier, periodStart);
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
  // B12 decision 12: never down to a plan the clinic is already over (accountUsage: open branches, active logins).
  const over = !isTierUpgrade(account.tier, tier) && tier !== account.tier && downgradeProblem(tier, accountUsage(platform.tenants[clinicId]!));
  if (over) return over;
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
  const nextAmount = monthlyFee(nextTier, nextDue);
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
    receipts: receiptsOfClinic(clinicId),
    paymentQr: paymentQrView(),
    today: today(),
  };
}

/**
 * B12 decision 25: may this login use a billing-only session? The Owner (clinic.manage) of a clinic paused by its own
 * unpaid subscription. A pause made by hand, or a cancelled subscription, keeps everyone but parents out.
 */
export function billingOnlyFor(account: { roles: readonly Role[] }, clinicId: string): boolean {
  return accountById(clinicId)?.status === "suspended" && subscriptionOf(clinicId)?.pause === "overdue" && rolesCan(account.roles, "clinic.manage");
}
