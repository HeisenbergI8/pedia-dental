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

## Phase 5: Platform files, multi-part uploads, prices and the QR — 2026-10-18

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `apps/api/src/storage/{platform-files.service,platform-files.test,image-form,multipart,multipart.test,local-disk.storage,delete-file.handler,storage.module}.ts`; `src/platform-settings/{platform-settings.service,prices.controller,payment-qr.controller,platform-settings.module}.ts` (new); `src/app.module.ts`; `test/operator-routes.test.ts` (new); `test/int/platform-settings.int.test.ts` (new), `test/int/support/operator.ts` (new)
**Deviations from plan:**
- `image-form.ts` (`readImageForm`): the mock's reader for the QR and receipts (`data` JSON + one sniffed image), shared by Phase 7's receipt routes.
- `deletePlatformFile(key)` builds the outbox row (`platform: true`, no clinic).
- **One `PriceChange` per day**: a second save on the same day keeps the first change (it already holds the list in force before that day; `priceOn` reads `before` only for earlier days). Same billing for every day as the mock's list of changes, without depending on two rows' creation order. Changes are read by `on`.
- **Operator actions are logged with the operator's id, not written to the audit trail**: `AuditEvent` is clinic-scoped and its `actorRole` is a clinic `Role`; the mock audits no operator action either. Flagged for the auditor.
- `GET /operator/payment-qr` answers JSON `null` explicitly (Nest sends an empty body for `null`).
- `operator-routes.test.ts` proves "reaches a controller" by 401 (Nest's 404 comes before the guard), as `clinic-routes.test.ts`.
**Gate:** `pnpm run check`: green. `platform-settings.int.test.ts`: 8 green.

## Phase 6: Sign-ups, `createClinic`, usage reads — 2026-10-18

**Steps completed:** 6.1, 6.2, 6.3, 6.4
**Files changed:** `apps/api/src/subscription-records/{subscription-records.service,subscription-records.module,subscription.rows,subscription.rows.test}.ts` (rows moved here from `src/subscriptions/`); `src/receipt-records/{receipt-records.service,receipt-records.module,receipt.rows}.ts`; `src/usage/{usage.service,usage.module}.ts`; `src/signups/{signups.service,signups.controller,signups.module,signups.jobs,signup-form,clinic-factory,clinic-factory.test}.ts`; `src/operator/{account-overview,operator-signups.controller,operator.module}.ts`; `src/auth/{rate-limit,rate-limit.test}.ts`; `src/audit/audit.service.ts` (`recordFor`); `src/message-queue/message.rows.ts`, `src/seed/seed-database.ts` (seeded sent texts carry `dispatchedAt`); `src/app.module.ts`; `test/operator-routes.test.ts`; `test/int/signups.int.test.ts` (new)
**Deviations from plan:**
- `SubscriptionRecordsService` was written whole here (Step 7.1's writes included: settle, payments, plan changes, cancel, receipts): one owner of the tables, written once. Phase 7 adds its routes, jobs and the sign-in check.
- `SignupsService.approve`/`createDirect` return `{ clinicId, temporaryPassword, pin }`; the operator controller builds the overview, so `SignupsModule` doesn't import the operator module (no cycle).
- New ids are `randomUUID()` (no cuid2 library in the API); they fit the id columns and the storage key segments.
- `AuditService.recordFor(tx, actor, action, record, at)`: the new clinic's first event, dated when the Terms were accepted (the mock's `createClinic`).
- `PAID_PLAN_LOCKED` lives in `signups.service.ts` with the mock's words (the mock keeps it in `signup-mocks.ts`, not shared).
- The purge job (Step 7.4) is `SignupsService.purgeRejectedFiles` + `signups.jobs.ts`, written here with the service.
- A sent seeded text now has `dispatchedAt` (= its send time), so the usage count (texts handed to the provider, E9) isn't zero on the demo.
- The forced-failure test breaks the transaction's last write (a taken invoice number) instead of a Staff email clash (a brand-new clinic can't hold one).
**Gate:** `pnpm run check`: green. `signups.int.test.ts`: 14 green; `platform-settings.int.test.ts`: 8 green.

## Phase 7: Subscriptions, the console, receipts and the jobs — 2026-10-18

**Steps completed:** 7.1, 7.2, 7.3, 7.4 (written in Phase 6), 7.5, 7.6 (amendment, decision 25)
**Files changed:** `apps/api/src/subscription-records/{subscriptions.jobs,subscriptions.jobs.test,subscription-records.module}.ts`; `src/auth/{auth.service,identity.service,access.guard,auth.module}.ts`; `src/clinic/{limits,branches.service,staff.service,clinic.module}.ts`; `src/operator/{operator-accounts.service,operator-accounts.controller,operator-receipts.controller,operator.module}.ts`; `src/clinic-billing/{clinic-billing.controller,clinic-billing.module}.ts` (new); `src/signups/signups.service.ts` (`designOf`, `markDesignDelivered`); `src/app.module.ts`; `test/{access-guard,operator-routes}.test.ts`; `test/int/{subscriptions,receipts,operator-console}.int.test.ts` (new), `test/int/support/clinic-login.ts` (new), `test/int/sessions.int.test.ts`
**Deviations from plan:**
- The receipt routes' access test is in `operator-routes.test.ts` (clinic, operator and public tables) rather than a separate `receipts-routes.test.ts`; front desk's 403 on `/clinic/subscription` is in `receipts.int.test.ts`.
- **Five parallel by-hand payments pay five consecutive months** (each takes the first unpaid one under the locks), not "one row": the test proves no month is paid twice and invoice numbers stay gapless across two clinics. The mock's double-click guard is the UI's.
- "Amount due has changed" is proven on Bulilit (a month that starts after a price change); an overdue month can't be repriced by a change dated today (decision 11).
- Settle isn't written to the audit trail (logged with the clinic id and the patch's keys): the trail holds clinic users, and the mock audits no settle.
- Billing-only (decision 25): `ClinicIdentity.billingOnly` from the account's status and `Subscription.pause = overdue` and `clinic.manage`; `readOnly` false for it; the guard answers `BILLING_ONLY_MESSAGE` outside `BILLING_ONLY_ROUTES`. Sign-in settles each opened match's clinic, then reads the logins again before the active check.
**Gate:** `pnpm run check`: green. `test:int`: 50 files, 553 tests green.

## Phase 8: Storage and text allowances, usage — 2026-10-18

**Steps completed:** 8.1, 8.2, 8.3, 8.4
**Files changed:** `apps/api/src/storage/{storage.service,storage.test}.ts`; `src/message-queue/message-send.handler.ts`; `src/clinic/{clinic.service,clinic.module}.ts`; `prisma/schema.prisma` + `prisma/migrations/20261018120000_b12_message_dispatch_index/` (new: `Message(clinicId, dispatchedAt)`); `test/int/allowances.int.test.ts` (new)
**Deviations from plan:**
- The text check's month count (`partsIn`) lives in `message-send.handler.ts` (the handler already writes `Message` in the queue module) rather than on `MessageQueueService`.
- A refused text answers `OutboxPermanent` (fails at once, no retries), like "no usable number" (decision 19).
- A new index `Message(clinicId, dispatchedAt)`: the claim sums the month's parts by dispatch time under the account lock.
- No `message-send.handler.test.ts` unit test: the rule is proven on MySQL (`allowances.int.test.ts`: two reminders at 299/300 parts, an invite past the limit, last month's parts not counted), where a faked Prisma couldn't catch a wrong query.
- `/clinic/usage`'s expectations in `owner-settings.int.test.ts` already use `toMatchObject` (Phase 1).
**Gate:** `pnpm run check`: green. `test:int`: 51 files, 558 tests green.

## Phase 9: `API_ROUTES`, the e2e spec, docs — 2026-10-18

**Steps completed:** 9.1, 9.2, 9.3
**Files changed:** `apps/web/src/mocks/{passthrough,passthrough.test,access}.ts` (OPERATOR_RULES and PUBLIC_RULES exported for the sweep); `apps/web/e2e/api-operator.spec.ts` (new); `apps/web/e2e/{api-owner-settings,api-sign-in}.spec.ts` (the subscription and the console now come from the API); `CONVENTIONS.md`; `apps/api/CONVENTIONS.md`; `apps/api/CHUNKS.md`
**Deviations from plan:**
- `.env.example`: unchanged (B12 needs no new variable; `STORAGE_DIR`/`STORAGE_LINK_SECRET` exist since B10).
- Two B2/B3 API specs asserted the subscription and the console were MSW's; they now assert the API's.
**Gate:** `pnpm run check`: green. `e2e/api-operator.spec.ts`: 5/5 against apps/api in `hybrid`, twice on one database. `api-sign-in`, `api-owner-settings`, `api-photos-documents`, `api-messages`, `api-portal` re-run on the same server: green (after clearing `RateLimitCounter`, as their headers say).
