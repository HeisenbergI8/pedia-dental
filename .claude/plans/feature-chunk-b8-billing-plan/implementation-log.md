# Implementation log: Chunk B8, Billing, payments and the financial dashboard

Plan: `feature-chunk-b8-billing-plan.md`. One entry per phase, in B7's shape. Record deviations from the plan as they
happen, with the reason; "none" when there are none.

## Decisions confirmed by the user — 2026-10-17

1. **Receipt numbers:** one sequence per clinic, as the mock: `AR-000001…` for money received, `CR-…` for deposit
   credit applied to a bill. Acknowledgment receipts, not BIR official receipts. They never repeat or skip under
   parallel payments (plan E3).
2. **Voiding a bill made by mistake:** a required reason, only while nothing has been paid or applied on it. It stays
   on record marked voided (who, when, why), its treatments become billable again, and it counts in no balance,
   unpaid list or finance total. Built in `@pedia/shared`, the MSW handler and its tests, and the web UI first, then
   the API (`POST /invoices/:id/void`).
3. **Refunds** (a negative payment on a bill, a deposit refund) by the Owner and admins only; front desk still records
   payments and deposits. New permission `billing.adjust`. Applying and returning deposit credit stays
   `billing.collect` (not a refund).
4. **Payments are dated now**, as the mock. No back-dating.

**Answered by the user, 2026-10-17 (all as recommended):** voiding is the Owner's and admins' (`billing.adjust`); any
payment ever made on a bill blocks its void, refunded or not; voided bills are hidden from parents; an appointment
billed twice is judged by its first bill (the demo's rule, changed later everywhere at once). The daily list and the
dashboard aren't logged, applying the user's B7 decision 6 for whole-day screens.

Engineering decisions E1–E13 as the plan records them.

<!-- Template for each phase:
## Phase N: <name> — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:**
-->

## Phase 1: Shared contract and domain — 2026-10-17

**Steps completed:** 1.1–1.5
**Files changed:** `packages/shared/src/schemas/{auth,billing}.ts`, `packages/shared/src/domain/{money,notes,finance,patient-list}.ts`, tests `permissions.test.ts`, `money.test.ts`, `notes.test.ts`, `finance.test.ts`
**Deviations from plan:** `InvoiceLine` gained its exported type (`money.ts`'s `BillTotals` reads it). Otherwise none.
**Gate:** `pnpm run check` exit 0 (shared 201, seed 22, web 342, api 298).

## Phase 2: The mock and its tests — 2026-10-17

**Steps completed:** 2.1–2.4
**Files changed:** `apps/web/src/mocks/{idempotency,idempotency.test}.ts` (new), `apps/web/src/features/billing/mocks.ts`, `apps/web/src/mocks/access.ts` + `apps/api/src/auth/access-rules.ts` (the void rule), `apps/web/src/mocks/{handlers,tenancy,cross-branch}.test.ts`
**Deviations from plan:**
- A voided bill's 409 on payment and credit is checked before the key's `once()`, not inside it: same answer, and a refusal is never kept anyway.
- The tenancy case uses Ngiti's Owner (`ngiti_staff_lim`): the void route needs `billing.adjust`, which Ngiti's front desk lacks, so a 404 needs the Owner.
**Gate:** mock tests 204 passed.

## Phase 3: The web — 2026-10-17

**Steps completed:** 3.1–3.4
**Files changed:** `apps/web/src/lib/{idempotency,idempotency.test}.ts` (new), `apps/web/src/features/billing/api.ts`, `components/{void-invoice-dialog (new),payment-dialog,apply-credit-dialog,create-invoice,billing-tab}.tsx`, `apps/web/src/features/portal/components/portal-records.tsx`, `apps/web/e2e/{admin,frontdesk}.spec.ts`
**Deviations from plan:**
- `portal-home.tsx` unchanged: it reads only `accountSummary`, which already skips voided bills.
- The void dialog's field reads "Why is it voided?", as the cancel dialog's "Why is it cancelled?".
- The admin e2e case makes its own unpaid bill (a fluoride signed through the demo's API in the page): every seeded bill has a payment, so none can be voided.
**Gate:** `pnpm run check` exit 0 (web 355); `check -- design` exit 0; demo-mode Playwright, desktop: the two new cases and 12 existing billing cases, 14/14.

## Phase 4: Tables, shapes, rules, seed — 2026-10-17

**Steps completed:** 4.1–4.4
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_billing/migration.sql`, `apps/api/src/prisma/{model-scope,tenant-scope.test}.ts`, `apps/api/src/billing-records/{billing.rows,billing.rows.test}.ts`, `apps/api/src/billing/{billing.rules,billing.rules.test}.ts`, `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** the migration is generated with `prisma migrate diff` (CONVENTIONS' route), not `migrate dev`. It has 5 tables and nothing touching earlier tables. The enum parity test gains `PaymentMethod`.
**Gate:** `pnpm run check` exit 0; `test:int` 31 files, 296 passed + 3 todo.

## Phase 5: Records, idempotency, receipts, sweep — 2026-10-17

**Steps completed:** 5.1–5.4
**Files changed:** `apps/api/src/billing-records/{billing-records.service,billing-records.module}.ts`, `apps/api/src/idempotency/{idempotency.service,idempotency.jobs,idempotency.module,idempotency.test}.ts` (all new), `apps/api/src/app.module.ts`, `apps/api/test/int/idempotency.int.test.ts` (new)
**Deviations from plan:**
- The two plan QUESTIONs are settled by tests. Raw SQL dates go in as UTC text (`utc()`), and the int test asserts no 8-hour shift. `isDuplicateKey` accepts P2002 or P2010-wrapping-1062, and case 10 pins it.
- `createInvoice` lets Prisma's `cuid(2)` default make the id: the contract input has none.
- `voidInvoice` uses `updateMany` (the tenant extension's scoped write) rather than `update`.
- `IdempotencyModule` imports nothing: `JobsModule` is global.
- Mutation: with the key claim removed, all 5 parallel-key rounds go red.
**Gate:** `pnpm run check` exit 0 (after a follow-up fix: the first commit had a type error in the new int test, `createMany` without `clinicId`); `test:int` 32 files, 310 passed + 3 todo.

## Phase 6: Services, controller, module — 2026-10-17

**Steps completed:** 6.1–6.3
**Files changed:** `apps/api/src/billing/{invoices.service,payments.service,billing.controller,billing.module}.ts` (new), `apps/api/src/reports/{collections.controller (new),reports.service,reports.module}.ts`, `apps/api/src/{patients/patients.service,plan/plan.service,visits/visits.service,clinic/clinic.service}.ts` (`exists`, `items`, `appointmentsOf`, `isActiveStaff`), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`
**Deviations from plan:**
- The plan's QUESTION: procedures have no archived state, so `ClinicService.procedures()` returns every one, and a bill's line always gets its name.
- The bill's lines follow the order the treatments were asked in, as the mock's `filter` over its own order (Phase 7's case checks it). It doesn't use the plan's order.
- `isDay` is shared by `/reports/today` and `/payments` (the real-calendar-day check from B7's review fix).
**Gate:** `pnpm run check` exit 0.

## Phase 7: Port the billing cases; races — 2026-10-17

**Steps completed:** 7.1, 7.2
**Files changed:** `apps/api/test/int/billing.int.test.ts`, `apps/api/test/int/billing-races.int.test.ts` (new)
**Deviations from plan:**
- The header summary's balance (case 1) and the patient list wait for Phase 8, which owns them.
- A replay's body equals the first by value, not byte for byte: MySQL's JSON column reorders an object's keys. The race compares values; the API contract is unaffected.
- The mixed load runs 25 rounds × 3 families × 5 requests (375 requests) rather than 100 rounds, which keeps the suite under a minute. Nothing came back as a 5xx, balances and deposits stayed ≥ 0, and AR stayed gapless.
- The parent case has no audit assertion: the guard's own-child read is B7's, and its audit is already covered in `appointments`.
- Mutations: with both locks removed from `pay`, all 5 overpay rounds go red. With `lockPatient` removed from `applyCredit`, all 20 overdraw rounds go red.
**Gate:** `pnpm run check` exit 0; `test:int` 34 files, 372 passed + 3 todo.

## Phase 8: The patient list and the header — 2026-10-17

**Steps completed:** 8.1, 8.2; 8.3's parity part (its dashboard case moves after Phase 9, which serves `/reports/finance`)
**Files changed:** `apps/api/src/billing-records/billing-records.service.ts` (`billTotals`, `BillTotalsOf`), `apps/api/src/patients/{patient-standing,patient-standing.test,patients.service,patients.module}.ts`, `apps/api/test/int/patients-read.int.test.ts`
**Deviations from plan:**
- `patient.views.test.ts` unchanged: `toSummary` already passes the standing's balance through with `billing.view` (B7's test covers it).
- The parity case now compares each row's balance with the mock's `patientStanding` over the seed's real bills and payments. `needs_attention` is checked as recall or balance due.
**Gate:** `pnpm run check` exit 0; `patients-read.int.test.ts` 14 passed + 1 todo (the dashboard case, after Phase 9).
