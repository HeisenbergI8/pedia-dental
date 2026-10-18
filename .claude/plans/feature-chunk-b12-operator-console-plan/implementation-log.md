# Implementation log: B12 operator console, sign-ups and subscriptions

## Phase 1: The shared contract — 2026-10-18

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/domain/{allowance,allowance.test,tenancy,sending,subscription,subscription.test}.ts`, `schemas/{tenancy,signup,subscription,operator,payments,payments.test}.ts`, `index.ts`; `apps/web/src/features/clinic/mocks.ts`, `features/operator/mocks.ts`, `mocks/{signups,subscriptions,owner-settings.test}.ts`, `features/clinic/components/settings.test.ts`; `apps/api/src/clinic/{limits,limits.test,clinic.service}.ts`, `test/int/owner-settings.int.test.ts`
**Deviations from plan:**
- `ConfirmReceiptInput` is built from `PaymentMethod` directly (not `RecordUpfrontPaymentInput.pick`), so `payments.ts` doesn't import `signup.ts`, which imports it (no cycle).
- `PaymentReceipt` and `PaymentQr` (the stored shapes, planned in 2.1) are in `schemas/payments.ts` already.
- The API's `/clinic/usage` stopgap reads `StorageService.usedBytes()` for storage and 0 for texts until Step 8.3 (the plan's `sentIn` stopgap would count the whole log's segments).
- Usage tests that compared the whole `ClinicUsage` now use `toMatchObject` (the new keys aren't their point).
**Gate:** `pnpm run check`: green.

## Phase 2: Seed and mock — 2026-10-18

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 (amendment, decision 25)
**Files changed:** `packages/seed/src/{platform,seed-receipts,seed,seed-ngiti,seed-ipin,index,seed.test}.ts`; `apps/web/src/mocks/{db,receipts,allowances,signups,subscriptions,outbox,access,handlers}.ts` and their tests (`payments.test`, `allowances.test`, `subscriptions.test`, `signups.test`, `operator.test`); `features/{operator/payment-mocks,operator/signup-mocks,operator/mocks,signup/mocks,clinic/mocks,auth/mocks,patients/…,photos/…}.ts`; `apps/api/src/auth/access-rules.ts` (rules only, drift test); `packages/shared/src/{domain/subscription,schemas/auth}.ts` (billing-only routes and flag)
**Deviations from plan:**
- `PaymentReceipt` and `PaymentQr` were already in Step 1.3, so 2.1 only seeds them.
- `purgeRejectedFiles` is synchronous: records first, then the blobs, so a second request can't purge twice.
- The old "downgrade at the boundary" test was rewritten for decision 12 (refused with `downgradeProblem`), and the overdue-pause test for decision 25 (the Owner keeps a billing-only session; other routes 403).
- `beforeEach(resetSignupHits)` added to the sign-up test files: the new 5-an-hour limit would otherwise trip across tests.
**Gate:** `pnpm run check`: green.

## Phase 3: Screens — 2026-10-18

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5 (amendment, decision 25)
**Files changed:** `apps/web/src/features/payments/{form-data.ts,components/{pay-by-qr,receipt-upload,receipt-list}.tsx}` (new); `features/clinic/{api.ts,components/{plan-panel,usage-banner,billing-only-screen}.tsx}`; `features/signup/{api.ts,components/signup-status-screen.tsx}`; `features/operator/{api.ts,components/{payments-screen,payment-qr-card,operator-shell,price-list-screen,account-detail,subscription-card,signup-detail,allowance}.tsx}`; `app/operator/(console)/payments/page.tsx`; `features/auth/components/access-gate.tsx`; `components/app-shell.tsx`; e2e `payments.spec.ts` (new), `operator.spec.ts`, `plan-limits.spec.ts`, `signup.spec.ts`
**Deviations from plan:**
- The MSW e2e for 3.4 is one new file, `e2e/payments.spec.ts` (QR + confirm with the badge, reject + resend from Plan, sign-up receipt, usage tiles, the billing-only screen), not spread over operator/signup/owner specs.
- `ReceiptList` is shared (`features/payments/components/receipt-list.tsx`) by the Plan panel and the console's subscription card.
- The console's Plan card shows `downgradeProblem` before saving and disables Save (decision 12); `overLimits` was removed (unused).
- The billing-only screen uses the clinic's logo, not Primolar's (decision #32's guard), and a "Primolar confirmed it? Open the clinic" link that re-reads /auth/me; the gate also re-reads it on focus.
- Older e2e fixed on the way: the downgrade stories (now refused; the waiting downgrade is shown on Ngiti), Ipin's hard-coded October dates (now from the seed's "3 days overdue"), a race in signup.spec's first-sign-in helper, and a keyboard test that pressed keys before the tabs were ready.
- The console nav's `<ul>` is `relative`: the badge's sr-only words had widened the page on a phone (operator.mobile.spec caught it).
**Gate:** `pnpm run check`: green. Playwright on MSW (production build, 2026-10-18, a Sunday): 461 passed, 61 skipped (E2E_API), 11 failed; 8 of them fail the same way on master (dentist, front desk and parent specs, not touched by B12), 2 were timing flakes that pass alone, 1 was ours (the nav width above), fixed.

## Phase 4: Tables, migration and the API seed — 2026-10-18

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/prisma/schema.prisma`, `prisma/migrations/20261018090000_b12_operator_billing/migration.sql` (new), `src/prisma/{model-scope,tenant-scope.test}.ts`, `src/storage/storage.ts` (`platformKey`, `parsePlatformKey`, `PLATFORM_AREAS`), `src/signups/signup.rows.ts` (new, both directions), `src/subscriptions/subscription.rows.ts` (new), `src/seed/seed-database.ts` (`seedBilling`), `test/int/seed.int.test.ts`
**Deviations from plan:**
- `platformKey`/`parsePlatformKey` moved into this phase (the plan's preferred option); the service stays for 5.1.
- `signup.rows.ts` has both directions now (`toSignupRow`, `toSignup`); `subscription.rows.ts` (contract → rows) added for the seed.
- The seed test compares sign-ups as rows: the seed writes instants with +08:00 and the database answers in UTC.
- Enum drift checks for the six new enums added to `tenant-scope.test.ts`.
- Note for Phase 5+: `resetDatabase` truncates the two singletons; services must not assume them in tests that reset without seeding.
**Gate:** `pnpm run check`: green. `test:int`: 45 files, 505 tests green.
