# Implementation log: chunk 23 (subscriptions, payments and the overdue pause)

The user asked for the plan's defaults (S1–S16) unless they contradict billing decisions.md; none do, so all are taken.

## Phase 1: Shared contract — 2026-10-13

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** new `packages/shared/src/schemas/subscription.ts`, `domain/subscription.ts`, `domain/subscription.test.ts`;
`packages/shared/src/index.ts`.
**Deviations from plan:** none.
**Gate:** `pnpm run check -- domain/subscription` green (shared 11/11 in the new file).

## Phase 2: Mock API — 2026-10-13

**Steps completed:** 2.1, 2.2, 2.3, 2.4
**Files changed:** new `apps/web/src/mocks/{clock,seed-ipin,seed-subscriptions,subscriptions,subscriptions.test}.ts`;
changed `mocks/db.ts` (Platform.subscriptions, Ipin, key v27), `mocks/seed.test.ts`, `mocks/access.ts` (settle at the top
of the gate; 1 clinic rule, 3 operator rules), `mocks/signups.ts` (createClinic starts the subscription),
`features/clinic/mocks.ts` (GET /clinic/subscription), `features/operator/mocks.ts` (reactivate guard, plan change via
changePlan, subscription view/payments/cancel routes), `mocks/operator.test.ts` (4 accounts, pending downgrade, guard list).
**Deviations from plan:** `seed.test.ts`'s chunk 20 test required every account to carry a demo logo; Ipin (default
look) has none, so the logo assertion is scoped to Bulilit and Ngiti. The plan's Potential Issues assumed that loop
only checked colours.
**Gate:** `pnpm run check -- mocks/seed` green (19/19); `pnpm run check -- src/mocks` green (9 files, 194/194).

## Phase 3: The Owner — 2026-10-13

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5
**Files changed:** `features/clinic/api.ts` (useSubscription, clinicKeys.subscription); new
`features/clinic/primolar-invoice.ts` + test, `components/billing-banner.tsx`, `components/payment-history.tsx`;
`components/plan-panel.tsx` (Billing card), `components/app-shell.tsx` (BillingBanner above the page).
**Deviations from plan:** `BillingBanner` writes `const can = useCan()` first, as the plan's own note suggested.
**Gate:** `pnpm run check -- primolar-invoice` green (3/3); `pnpm run check -- design` green (100/100, covers
design-tokens and design-shell); typecheck green.

## Phase 4: The console — 2026-10-13

**Steps completed:** 4.1, 4.2
**Files changed:** `features/operator/api.ts` (subscription key and three hooks); new `components/subscription-card.tsx`;
`components/account-detail.tsx` (SubscriptionCard, Plan card copy and upgrade/downgrade toast).
**Deviations from plan:** none.
**Gate:** typecheck green; `pnpm run check -- design` green (100/100); eslint on features/operator clean.

## Phase 5: Conventions, roadmap and close — 2026-10-13

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `CONVENTIONS.md` (console row, subscriptions domain rule, v27, Platform shape, clock trap, demo-today),
`ROADMAP.md` (chunk 23 done, built 2026-10-13, Ipin demo line), `features/clinic/components/payment-history.tsx`
(scroll wrapper made `relative`, found by the walk).
**Deviations from plan:** the walk's 375 px clause found the page 480 px wide on Settings → Plan and the console clinic
page: the sr-only label in the history table's last header is absolutely positioned and its containing block was
outside the scroll wrapper, so it escaped the clip. The wrapper is now `relative`. Not in the plan.
**Gate (5.3):** `pnpm run check` green: shared 181/181, web 332/332; `npx eslint src` 0 errors (2 old warnings).
**Walk (5.4):** `scratchpad/walk-chunk23.mjs` on :3150, data cleared before and after, demo-today removed.
1 PASS Ipin Owner sees the overdue banner; Plan shows "Overdue, in grace", amount with VAT, 2 payments;
2 PASS PRM-INV-00014.pdf downloads (19,785 bytes); 3 PASS admin sees no billing on home or Settings, Ngiti Owner sees
"due in 2 days, on 15 October 2026"; 4 PASS demo-today = pay-by + 1 → Ipin Owner's sign-in refused as paused;
5 PASS console shows "Paused for non-payment", Reactivate refused ("Record the payment…"), a recorded payment
reactivates, next due 10 Oct → 10 Nov (same day), Owner signs in; 6 PASS upgrade to Mid bills ₱5,000.00 next, downgrade
toast "on its next due date", card "To Small on 10 November 2026"; 7 PASS Hagikgik approved on 2026-10-31 is due
30 November 2026; 8 PASS 375 px dark: 375/375 (after the fix above). Console errors: only the expected 403 (paused
sign-in) and 409 (reactivate refused).

## Review fixes (tester + auditor) — 2026-10-13

Tester: every done-when clause held; 6 low items. Auditor: 82/100, all 18 steps delivered, 7 findings.
- **Medium, repricing a running month:** a plan change while overdue billed the already-running month at the new plan
  (upgrade overcharged, downgrade undercharged). Each month now bills at the plan in force when it began: an upgrade while
  overdue keeps the old price for months before the next boundary (`Subscription.priceTier`), and a downgrade's `on` is
  the first due date on or after today (`nextBoundary`), not the passed one. Settle keeps the old price for unpaid months
  when it applies a downgrade, and clears `priceTier` once those months are paid. `SubscriptionView.nextTier` carries
  the billed plan, so the console no longer works it out.
- Plan changes on a cancelled subscription are refused (409).
- Cancel dialog says the clinic "pauses now" when its paid month has already ended.
- Focus returns to Record payment (or the summary after a cancel) when the console dialogs close.
- Paid-on default and `cancelledAt` follow the mock clock (`SubscriptionView.today`, `stampToday`); "Cancelled on" shows
  the stored day.
- Settle lifts a subscription's own pause when the demo clock moves back; a manual pause still stays.
- `startSubscription` throws without an upfront payment instead of writing a free month.
- CONVENTIONS: the pricing rule and the clock-back behaviour added to the Subscriptions bullet.
**Gate:** `pnpm run check` green: shared 181/181, web 335/335 (3 new tests); `npx eslint src` 0 errors.
**Browser:** scratchpad/fixes23.mjs 5/5 PASS; walk-chunk23.mjs 8/8 PASS again.
