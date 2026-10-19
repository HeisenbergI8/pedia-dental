# B14 implementation log

Open questions settled (user: "fix it, merge only if the load test proves it"): Q1 store balance as a cache always recomputed from source rows, amend both CONVENTIONS rules; Q2 the unpaged full-directory screens go to Follow-ups / a later chunk; Q3 accept ranking within the 50 name matches; Q4 cap 50.

## Phase 1: Today without the whole patient table — 2026-10-19

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261022000000_b14_visit_date_index/migration.sql`, `apps/api/src/patients/patients.service.ts`, `apps/api/src/reports/reports.service.ts`, `apps/api/src/messages/messages.service.ts`, `apps/api/test/int/today.int.test.ts`
**Deviations from plan:**
- `basics()` had a second caller the plan's reference missed: `MessagesService.greetAll` (the daily birthday job). It now calls `basicsFor([], today)` (only today's birthday children, filtered again by `isBirthdayOn`), and `basics()` is deleted.
- Q4 settled by reading `isBirthdayOn` (`domain/messages.ts`: exact `MM-DD` match): a 29 February child never matches on 28 February, so the `leapDay` clause is dropped.
**Gate:** migration SQL from `prisma migrate diff --from-config-datasource` on `pedia_dental_b14_test`; `db:deploy`, `db:generate`, `db:drift` = no difference. `test:int today + messages`: 2 files, 24 passed. `pnpm run check` exit 0 (api 563 / 87 files, shared 251, web 415, infra 41, seed 31).
**Notes:** the new int case's oracle is the shared `todaySummary` over a full read of patients, completed visits, done appointments and birthday messages.

## Phase 2: Search capped at 50 matches — 2026-10-19

**Steps completed:** 2.1, 2.2
**Files changed:** `packages/shared/src/domain/patient-list.ts`, `apps/api/src/patients/patients.service.ts`, `apps/web/src/features/patients/mocks.ts`, `apps/web/src/mocks/handlers.test.ts`, `apps/api/test/int/patients-read.int.test.ts`
**Deviations from plan:**
- No unit test for the constant in `patient-list.test.ts` (a test of `50 === 50` proves nothing); the cap is proven by the twin web/API cases.
- The MSW sort is aligned to the API's order (last name, first name, id) inline: `comparePatients("name")` needs list rows with `flags`, which a directory `Patient` doesn't have.
- `port-ledger.ts` unchanged: the web and API cases share the title "a search answers at most PATIENT_SEARCH_LIMIT children, by name".
**Gate:** web `handlers.test.ts -t PATIENT_SEARCH_LIMIT` 1 passed; `test:int patients-read` 17 passed; `pnpm run check` exit 0 (api 563, shared 251, web 416, infra 41, seed 31).
**Notes:** Q3/Q4 (user) accepted: the picker ranks within the 50 name matches; cap 50. The demo seed has 60 children matching "a", so the cases are not vacuous.

## Phase 3: Stored standing columns and the shared bounds — 2026-10-19

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261022000100_b14_patient_standing/migration.sql`, `apps/api/src/patients/patient.views.test.ts`, `packages/shared/src/domain/patient-list.ts`, `packages/shared/src/domain/patient-list.test.ts`
**Deviations from plan:** none (the migration SQL is `prisma migrate diff`'s output, one ALTER with four columns plus the index, with the plan's header comment).
**Gate:** `db:deploy`, `db:generate` on `pedia_dental_b14_test`, `db:drift` = no difference. `patient-list.test.ts` 16 passed. `pnpm run check` exit 0 (shared 253, api 563, web 416, infra 41, seed 31).
**Notes:** the parity case runs `standingOn(storedStanding(...))` against `patientStanding` for 7 patients on today = 10-02/10-03/10-04 over due days today±1/+7/+8 and visits at today−29/−30, including a voided bill, a part payment, a booked (closing) due item and failed/sent texts.

## Phase 4: PatientStandingService and the refresh slot — 2026-10-19

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/src/visits/visit-days.service.ts`, `apps/api/src/recalls/due-items.service.ts`, `apps/api/src/billing-records/billing-records.service.ts`, `apps/api/src/message-queue/message-queue.service.ts`, `apps/api/src/patients/standing-refresh.ts` (new), `apps/api/src/patients/patient-standing.service.ts` (new), `apps/api/src/patients/patient-standing.service.test.ts` (new), `apps/api/src/patients/patients.module.ts`, `apps/api/src/app.module.ts`
**Deviations from plan:**
- `refresh` reads the stored rows (one `findMany` through `tx`, under the caller's lock) and compares in JS instead of `updateMany({ NOT: data })`: SQL `NOT (col = ?)` is NULL when the column is NULL, so a NULL `lastVisitOn` would never count as drifted (the plan's fallback). Only differing rows are updated; the count is the drift.
- `compute` feeds `openFor`'s already-open items into `storedStanding`; re-filtering them with `isDueItemOpen` over the done appointments (or none) keeps exactly the same set, so no rule is re-derived. `PrismaService` is not injected (unused).
**Gate:** `patient-standing.service.test.ts` 4 passed; `pnpm run check` exit 0 (api 567, shared 253, web 416, infra 41, seed 31); `test:int patients-read` 17 passed (the app boots with the global slot).

## Phase 5: Every write keeps the columns — 2026-10-19

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/api/src/appointments/appointment-records.service.ts`, `apps/api/src/visits/visits.service.ts`, `apps/api/src/recalls/due-items.service.ts`, `apps/api/src/billing-records/billing-records.service.ts` (+ its unit test's constructor), `apps/api/src/message-queue/message-send.handler.ts`, `apps/api/src/messages/messages.jobs.ts`, `apps/api/src/messages/messages.module.ts`, `apps/api/src/patients/standing-refresh.ts` (`STANDING_REFRESH`), `apps/api/src/patients/standing-refresh.handler.ts` (new), `apps/api/src/patients/standing.jobs.ts` (new), `apps/api/src/patients/patients.module.ts`, `apps/api/prisma/backfill-standing.ts` (new), `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/message-sending.int.test.ts`
**Deviations from plan:**
- `advance` refreshes only when `to` is done, cancelled or no_show (as `create`), not always: seating (arrived → in_chair) changes no stored column, so starting a visit adds no statements.
- `seedDatabase` cannot reach `PatientStandingService` (it takes a bare `PrismaService`, no Nest context), so it computes each child's columns from the seed's own rows with the same shared `storedStanding` (facts sliced per child) and writes them in the `patient.createMany`. Phase 7's consistency case checks stored = `PatientStandingService.compute` after the seed.
- Texts: the claim-transaction failure sites (not confirmed, no phone, past the month's parts) enqueue `standing.refresh` in that transaction; the three settle sites and `deadLetter` became `runInTransaction` holding the update and the enqueue (only when the update touched the row). The cancelled (used link) site enqueues nothing: a cancelled text doesn't decide "no contact". Account texts (invite, reset) enqueue nothing (`isAccountText`). The cross-clinic repair selects the affected (clinic, child) pairs first and enqueues one row each with `clinicId`, in the repair's transaction.
- `MessagesModule` imports `OutboxModule` (not global) for the repair's `OutboxService`.
- `standing.reconcile`'s start-up run is not awaited (start-up doesn't wait), and `reconcileAll` is shared by the job and `db:backfill-standing`.
- `message-sending.int` "retries after about 1, 5 and 30 minutes…": the last drain now handles the dead letter's `standing.refresh` row (1), then nothing (0), and the provider still saw 4 tries.
- `retention-schedule.test.ts` unchanged: the reconcile is not a retention job.
**Gate:** `pnpm run check` exit 0 (api 567, shared 253, web 416, infra 41, seed 31). `test:int` over appointments, visits, notes, billing, billing-races, recalls, message-sending, messages, messages-races, seed, jobs, outbox, message-queue, idempotency, appointment-requests: 254 tests, 1 failed (the drain count above), fixed; `message-sending.int` re-run 11 passed.

## Phase 6: The list in SQL — 2026-10-19

**Steps completed:** 6.1, 6.2
**Files changed:** `apps/api/src/patients/patient-standing.ts`, `apps/api/src/patients/patient-standing.test.ts`, `apps/api/src/patients/patients.service.ts`, `apps/api/src/patients/patient.views.ts`, `apps/api/test/int/support/standing-oracle.ts` (new)
**Deviations from plan:**
- `standingPage` (and its `byKey`, `Named`, `Standing`) moved unchanged to `test/int/support/standing-oracle.ts` as Phase 7's oracle, as the plan says; its old unit cases (which tested that JS) are replaced by the SQL builders' cases (3), so the api unit count goes 567 → 563.
- `toSummary` takes `{ lastVisitOn?, recallDueOn?, balance, flags }` instead of `Pick<Standing, …>`.
- `PatientsService` no longer injects `DueItemsService` or `MessageQueueService` (unused after `names()` and the four reader calls went). `names()` had no other caller.
- Each count is `COALESCE(SUM(cond), 0)` aliased by its filter and read by key (a SUM over no rows is NULL).
**Gate:** `patient-standing.test.ts` 3 passed; `test:int patients-read` 17 passed (the list cases compare against the mock's computation over the seed); `pnpm run check` exit 0 (api 563, shared 253, web 416, infra 41, seed 31).

## Phase 7: Consistency and parity tests — 2026-10-19

**Steps completed:** 7.1, 7.2
**Files changed:** `apps/api/test/int/standing.int.test.ts` (new), `apps/api/test/int/clinical-support.ts` (`clinicalApp({ platform, clock })`, optional)
**Deviations from plan:**
- One app for both describes: the demo plus `loadPlatform(300)` on a `FixedClock` (10:00 Manila, inside sending hours), through the shared `clinicalApp` harness given two optional arguments.
- 7.1's order follows what each step needs: register → sign an extraction note (opens the recall) → sign fluoride and prophylaxis → complete the visit → book from the due list → bill → pay part → refund → bill again and void → deposit and apply credit → no-show the booking (the recall reopens) → a text rejected by the provider, then the outbox drained. After each step the stored row equals `PatientStandingService.compute` (a fresh read through the readers), plus the expected value where the step decides it. The text's case asserts `noContact` turns true only after the outbox pass.
- The reconcile case also corrupts one row's balance and checks a run corrects exactly 1; the parallel case books while `reconcileAll` runs (both commit, drift 0).
- 7.2 runs today, today+7 and today+30 (both bounds cross with the load data's spread) × front desk and dentist (no `billing.view`) × q "" and "ma" × 5 filters × 3 sorts × first and last page: 720 page comparisons against `standingPage` over the same readers. Matches come from the uncapped directory filtered by the shared `matchesSearch`. Non-vacuity (every chip non-empty) is asserted on today only. No collation tie surfaced (D6).
**Gate:** `test:int test/int/standing.int.test.ts` 4 passed (run by hand on `pedia_dental_b14_test`).

## Phase 8: Documentation — 2026-10-19

**Steps completed:** 8.1 (CHUNKS in Phase 9, with the table)
**Files changed:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/README.md`, `packages/shared/src/schemas/patient-list.ts`
**Deviations from plan:**
- Root CONVENTIONS has no "Patients bullet"; the search cap is its own Domain-rules bullet next to the amended balance rule (Q1 confirmed by the user).
- apps/api CONVENTIONS: current phase, the Patients row (`PatientStandingService`, `StandingRefresh`, the handler, `standing.jobs.ts`, `patient-standing.ts`), the three new Traps, the load-test trap (no "misses"; stop by PID, confirm the exit, never `pkill -f`), the Paging bullet (search capped, directory unpaged), the money rule and the B8 balances bullet amended to "cache".
- README → Load test: a fresh `_load` database each run, the bundle started with its PID recorded, killed by PID, wait for the "Stored standing reconciled" line.
- `apps/api/CHUNKS.md` is written in Phase 9, with the final table (the plan's own Phase 9 step).
**Gate:** prose only (no Verify); `pnpm run check` runs at Phase 9.
