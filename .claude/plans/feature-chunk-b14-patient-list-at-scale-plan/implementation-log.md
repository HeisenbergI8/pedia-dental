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

## Phase 9: Load run at 5,000 and the gate — 2026-10-19

**Steps completed:** 9.1, 9.2
**Files changed:** fix commit 6fb34b8: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261022000200_b14_appointment_start_index/migration.sql`, `apps/api/src/outbox/outbox.service.ts`, `apps/api/src/audit/audit.service.ts` (+ test), `apps/api/src/message-queue/message-queue.service.ts`, `apps/api/src/patients/standing-refresh.handler.ts`, `apps/api/test/int/today.int.test.ts`; then `apps/api/CHUNKS.md`, this log.

### First run: Book missed (everything else met)

A first run after Phase 6 (fresh `pedia_dental_b14p_load`, production bundle, `LOAD_RECORD_ONLY=1`): Today 152/147, list
147, balance list 207, search 140 (p97.5 ms, all OK), **Book p97.5 464 ms > 400** (27.6 req/s).

Profile (B14 bundle, Book only, same `PROFILE`, via a scratch copy of `run.ts` filtered to one target under the
gitignored `apps/api/var/`, removed afterwards):
- **Master misses too today.** The master f42038e bundle on a fresh `_load` database: Book p97.5 448 ms, 27.5 req/s
  (the plan's baseline was 349 ms, 32.6 req/s, so the box or the hour is slower now); on a used database 435 ms. A B14
  run with the `standing.refresh` enqueue switched off (a temporary env check, never committed) was no faster (417 vs
  411–416 ms on the same database), so the refresh was not the cause.
- Process CPU during Book: node 76%, mysqld 47%: not CPU-bound. The slow log at `long_query_time=0` (globals restored
  afterwards) showed 304 s of the run's ~35 s × 10 connections waiting on `SELECT … FROM ClinicAccount … FOR UPDATE`:
  bookings serialize on the clinic's lock (E1), so throughput = 1 / (the locked section's length). One booking's
  section was ~37 ms and ~30 statements.
- The largest statement in it: the clash check (`near`), 2.8–5.6 ms, `EXPLAIN ANALYZE`: the planner used
  `(clinicId, branchId, startsAt)` on `clinicId` only and scanned the clinic's 6,127 appointments.

Fixes (deviation, recorded here: the plan's Book assumption was "unchanged ≤ 360 ms"; these stay within its design and
touch no threshold, profile or data size):
1. `Appointment @@index([clinicId, startsAt])` (migration `20261022000200_b14_appointment_start_index`, from `prisma migrate diff`): the clash check is a one-day range scan, 0.08 ms.
2. `OutboxService.enqueue` and `AuditService.record` insert with `createMany` (one INSERT, no SELECT read-back; no caller used the returned outbox id). Unit test updated.
3. `MessageQueueService.queueBooking` reads the templates, dentist and clinic name once for all of a booking's texts (`refs` + `write`, split out of `queue`).
4. `StandingRefreshHandler` compares without the lock first and locks only to write (most settled texts change nothing).

Book-only after 1: p97.5 443 (p50 310); after 1+2: 378, 385; after 1–4: 361. A full run after 1+2: all OK, Book 396.

### Gate run (final)

Commit 6fb34b8, fresh `pedia_dental_b14f_load`: `db:deploy`, `load:seed` (5,000 extra patients, 20 s), `build`, then
`DEMO_LOGINS=true COOKIE_SECURE=false BACKGROUND_WORK=true node --enable-source-maps dist/main.mjs` (PID recorded; start-up
log "Stored standing reconciled: 0 patient row(s) corrected"), then `pnpm --filter api load:run` (thresholds enforced, not
record-only): **exit 0**. MySQL 8.0.46, 4 cores, 15 GB, the same box as the baseline.

| Target | Requests | req/s | p50 ms | p97.5 ms | p99 ms | Target p97.5 / p99 | Baseline req/s, p50 / p97.5 / p99 | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Today (Imus) | 2770 | 92.3 | 105 | 148 | 160 | 300 / 800 | 23.8, 410 / 601 / 640 | OK |
| Today (all branches) | 2541 | 84.7 | 116 | 157 | 165 | 400 / 1000 | 23.6, 416 / 534 / 599 | OK |
| Patient list | 2853 | 95.1 | 102 | 150 | 159 | 500 / 1200 | 2.3, 3540 / 5709 / 5711 | OK |
| Patient list: balance due, by balance | 2155 | 71.8 | 137 | 203 | 217 | 500 / 1200 | 2.3, 3558 / 5836 / 5841 | OK |
| Search (`?q=ma`) | 2907 | 96.9 | 98 | 150 | 159 | 300 / 800 | 8.1, 1192 / 2077 / 2355 | OK |
| Book | 1067 | 35.6 | 273 | 346 | 360 | 400 / 1000, ≥ 20 req/s | 32.6, 302 / 349 / 357 | OK |

No non-2xx answers. The API was stopped by its PID (exit confirmed); every `_load` database this session made
(`pedia_dental_b14p_load`, `_b14m_load`, `_b14f_load`) was dropped (`pedia_dental_load` pre-existed and was left).

**Other deviation:** the full `test:int` on the fix commit's parent failed one case, `today.int` "for every day of this
week": on 2026-10-23 two seeded roster children share a birthday, the mock lists them in its array's order and the API by
id (as master's `basics()` did), and neither id, `createdAt` nor `patientNo` follows the seed's array. The case now
compares birthdays sorted by child on both sides (`byChild`); the API keeps `ORDER BY id`. A date-dependent flake on
master as well, not a B14 behaviour change.

**Gate:** `pnpm run check` exit 0 (api 563 / shared 253 / web 416 / infra 41 / seed 31). Full `pnpm --filter api test:int`
on 6fb34b8: 59 files, 652 passed. `load:run` at 5,000: every target met (table above).

## Review fixes (after tester PASS and auditor 55/100)

- **F1 High:** a text born `failed` (no usable mobile) now enqueues `standing.refresh` in `MessageQueueService.write`; new case in `standing.int` ("a text born failed") fails without the fix, passes with it.
- **F2 Medium:** `StandingRefreshHandler` locks first, then recomputes (the unlocked pre-check could lose an update).
- **F3 Medium:** `standing.int` asserts the FIRST reconcile corrects 0 rows (seed + every write kept the standing).
- **F5 Low:** the dead-letter repair's select is `FOR UPDATE`.
- **F7 Low:** CHUNKS Later gains "Page the full patient directory" (Q2).
- Left: F4 (rolling-deploy window; the nightly reconcile heals it, `db:backfill-standing` after a rollout if wanted), F6 (test-only sort), smells.
- Gates on the final code: `pnpm run check` exit 0 (api 563, shared 253, web 416, infra 41, seed 31); full `test:int` 59 files, 652 passed.
- Final `load:run` at 5,000 on fresh `pedia_dental_final_load`, thresholds enforced, exit 0: Today Imus p97.5 142 / p99 155; Today all 147 / 161; Patient list 135 / 148; balance-due list 206 / 223; Search 155 / 162; Book 331 / 344 at 36.7 req/s. Tester's two independent runs on 9cd4c6a also met every target.
