// apps/web/src/mocks/subscriptions.ts (212 lines): billing #25–#30. Runs on `platform` only.

// The rules the plan moves to domain/subscription.ts as pure functions (E5):
function billedTier(sub, periodStart = unpaidFrom(sub)) {
  if (sub.priceTier && periodStart < sub.priceTier.until) return sub.priceTier.tier;
  if (sub.downgrade && periodStart >= sub.downgrade.on) return sub.downgrade.tier;
  return accountById(sub.clinicId)!.tier; // NOTE: reads the account; the shared version takes the tier as an argument
}
const monthlyFee = (tier) => platform.prices.plans[tier].monthlyFee;
// IMPORTANT: today's price list for every month, even one already running → decision 11 needs priceOn (E4).

// settleSubscriptions(day): called at the top of the access gate on EVERY request (mocks/access.ts:364).
// downgrade on its date → keepPriceFor + tier; drop priceTier once passed; lapsed/ended on an ACTIVE clinic →
// suspended + pause cause; own pause no longer applying on a suspended clinic → active (manual pause untouched).
// IMPORTANT: the API runs this as a nightly job plus a check at sign-in (decision 4, CHUNKS B12), never per request.

// recordSubscriptionPayment: cancelled → refusal; one month at billedTier's fee; schedule moves by paidMonths, never
// the paid date; lifts an `overdue` pause unless still lapsed.
// changePlan: upgrade now (keepPriceFor), same plan drops a waiting downgrade, downgrade waits for nextBoundary.
// NOTE: no usage check — decision 12 adds downgradeProblem (Step 2.3).
// cancelSubscription: cancelledAt = stampToday(), clears downgrade, then settles at once.
// reactivateRefusal: lapsed / ended → refusal words (the operator's Reactivate).
