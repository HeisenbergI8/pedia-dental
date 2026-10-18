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
