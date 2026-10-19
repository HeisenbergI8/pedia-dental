# Implementation log: B13c2b-1 (privacy request register and restriction on erasure)

Branch `feature/b13c2b1-privacy-requests`, from master `5432ad1` (B13c2a merged). Scope: Phases 1–6; section 5
(B13c2b-2) is out of scope. The repo matched the plan's starting state (planned at `acc4439`, now merged).

## Phase 1: Contracts — 2026-10-19

**Steps completed:** 1.1, 1.2
**Files changed:** `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/privacy-requests.ts` (new),
`packages/shared/src/schemas/patient.ts`, `packages/shared/src/index.ts`, `packages/shared/src/domain/privacy-requests.ts`
(new), `packages/shared/src/domain/privacy-requests.test.ts` (new)
**Deviations from plan:** none
**Gate:** `pnpm run typecheck` green; `vitest run src/domain/privacy-requests.test.ts` 4/4; `pnpm run check` exit 0
(shared 246, seed 31, infra 41, web 407, api 546 tests).
**Notes:** `PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT = 15` is the counsel placeholder (C4).
- Process note: the Phase 1 commit (`865be58`) has its body run into the subject line (no blank line after the
  subject). Left as is: no history rewrites on this branch.

## Phase 2: API: the register — 2026-10-19

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261020000000_b13c2b_privacy_requests/migration.sql`
(new, from `prisma migrate diff --from-config-datasource`), `apps/api/src/prisma/model-scope.ts`,
`apps/api/src/privacy/retention-schedule.ts`, `PRIVACY_OPERATIONS.md` (inventory regenerated: one `PrivacyRequest` row),
`apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/.env.example`,
`apps/api/src/privacy-requests/{privacy-requests.service,privacy-requests.controller,privacy-requests.module}.ts` (new),
`apps/api/src/app.module.ts`, `apps/api/src/auth/access-rules.ts`, `apps/web/src/mocks/access.ts`,
`apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`, `apps/api/test/privacy-routes.test.ts`,
`apps/api/src/patients/patient.views.test.ts`, `apps/api/test/int/privacy-requests.int.test.ts` (new)
**Deviations from plan:**
- The migration SQL is exactly the plan's expectation (one `ALTER TABLE Patient ADD restrictedAt`, one
  `Patient_clinicId_restrictedAt_idx`, one `CREATE TABLE PrivacyRequest` with two indexes). Applied with `db:deploy`,
  client regenerated with `db:generate`. The inventory was printed by a throwaway script in the scratchpad, not a test.
- `patient.views.test.ts`'s hand-built row gets `restrictedAt: null` now (planned in 3.3): the regenerated client makes
  tsc fail without it.
- `passthrough.test.ts` counts `API_ROUTES` exactly; it gains `B13C2B_ROUTES = 3` and a check that the three routes are
  served (the plan didn't list this file; it failed without it).
- Int case "lists open requests soonest due first, with the child's name" also asserts the child's name (its title
  claims it; the plan's body didn't check it).
**Gate:** `pnpm run check` exit 0 (shared 246, seed 31, infra 41, web 407, api 550);
`pnpm --filter api test:int test/int/privacy-requests.int.test.ts` 4/4 on MySQL 127.0.0.1:3307 (the `_test` database).
**Notes:** between Phase 2 and Phase 3 an erasure closed as done is not yet restricted (branch-internal, planned).

## Phase 3: API: restriction on an approved erasure — 2026-10-19

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5
**Files changed:** `apps/api/src/auth/patient-restrictions.ts` (new), `apps/api/src/auth/auth.module.ts`,
`apps/api/src/auth/access.guard.ts`, `apps/api/test/access-guard.test.ts`, `apps/api/src/visits/{visits.service,visits.module}.ts`,
`apps/api/src/notes/{notes.service,notes.module}.ts`, `apps/api/src/plan/{plan.service,plan.module}.ts`,
`apps/api/src/appointments/{appointments.service,appointment-requests.service,appointment-records.service}.ts`,
`apps/api/src/billing/{invoices.service,billing.module}.ts`, `apps/api/src/patients/{patients.service,patients.module,patient.views,patient.views.test,family.service,patient-writes.service}.ts`,
`apps/api/src/privacy-requests/{privacy-requests.service,privacy-requests.module}.ts`,
`apps/api/test/int/parent-ownership.int.test.ts`, `apps/api/test/int/privacy-requests.int.test.ts`
**Deviations from plan:**
- Step 3.1: `access-guard.test.ts` needed the `AuditService` override (the plan's open question: its Prisma stub has
  no `auditEvent`). The override records the calls, so the restricted case also asserts the one `denied` write.
- Step 3.2: invoices use the existing `BillingRecordsService.patientOfInvoice` (the plan named a new
  `invoicePatientOf`; it already exists under that name). `NotesService` gains a private non-throwing `ownerOf`, and
  `patientOf` keeps its 404 on top of it. `BillingModule` and `NotesModule` import `AuthModule` too (the plan named only
  Visits and Plan; both registering services need `RecordOwners`). No DI cycle (`pnpm run check` builds `AppModule`).
- Step 3.5: `lone` is picked from the seed with a guardian whose portal account is `active`, and the case first asserts
  that parent's `/auth/me` is 200, then 401 after the restriction on the **same** session cookie. Without an active
  portal login the 401 would hold before the restriction too (no credential), so the plan's case would be vacuous.
  The upcoming filter uses all four `UPCOMING` statuses (booked, confirmed, arrived, in_chair), as the service does.
- `/auth/me` for a parent with no unrestricted child answers 401 (`auth.controller.ts` `me`: no identity), as expected.
**Gate:** `pnpm run check` exit 0 (api 553, web 407, shared 246, seed 31, infra 41);
`pnpm --filter api test:int test/int/privacy-requests.int.test.ts test/int/parent-ownership.int.test.ts` 27/27;
the whole `pnpm --filter api test:int` 56 files / 628 tests passed.
**Notes:**
- The guard writes `denied` "Patient record (restricted)" only for this refusal (the API logs no other gate refusal).
- Gap, outside the plan (Q3-adjacent): routes that carry a child only in the **body** (e.g. `POST /appointments`,
  `POST /privacy-requests` itself) aren't checked by the guard. A restricted child is hidden from every picker, so the
  web can't reach it, but the API would accept a hand-made booking for a restricted id. Left for the auditor/user.
