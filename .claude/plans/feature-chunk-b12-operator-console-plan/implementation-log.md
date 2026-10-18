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
