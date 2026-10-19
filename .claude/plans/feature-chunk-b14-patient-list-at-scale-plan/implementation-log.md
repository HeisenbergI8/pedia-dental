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
