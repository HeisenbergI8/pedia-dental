# Implementation log: Chunk B5, Visits and the dental chart

Plan: `feature-chunk-b5-visits-chart-plan.md`. One entry per phase, in B4's shape. Record deviations from the plan as
they happen, with the reason; "none" when there are none.

## Phase 1: Tables — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int`
**Notes:** (did `migrate dev` warn? was the `migrate diff` workaround needed?)

## Phase 2: Shapes and rules — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`
**Notes:**

## Phase 3: Seed — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/seed.int.test.ts`
**Notes:**

## Phase 4: Visits — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/visits.int.test.ts`
**Notes:** (parallel-start rounds: how many 201/409 each)

## Phase 5: Chart — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/chart.int.test.ts`
**Notes:** (which Ngiti login was used for the tenancy case; parallel-correction rounds)

## Phase 6: Last visit in the summaries — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int` (all files)
**Notes:**

## Phase 7: Cut-over — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int`; `E2E_API=1 E2E_BASE_URL=http://localhost:3160 npx playwright test e2e/api-chart.spec.ts --project=desktop`
**Notes:** (database name, ports, whether `apps/web/tsconfig.json` had to be reverted)

## Phase 1: Tables — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016143631_visits_chart/migration.sql`, `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`
**Deviations from plan:** the migration SQL came from `prisma migrate diff --from-config-datasource` (CONVENTIONS' non-interactive route) rather than `migrate dev`; B4's pending migrations were deployed to the dev database first.
**Gate:** `pnpm run check` green (api 205); `test:int` 22 files, 157 passed + 5 todo.
**Notes:** none.

## Phase 2: Shapes and rules — 2026-10-16

**Steps completed:** 2.1, 2.2, 2.3
**Files changed:** `apps/api/src/visits/visit.rows.ts` + test, `apps/api/src/chart/chart.rows.ts` + test, `apps/api/src/chart/chart.rules.ts` + test (all new)
**Deviations from plan:** the plan's `example_caries_74` patient isn't in the seed; the deriveChart round-trip case uses the seeded patient with the most entries instead. `Map.groupBy` isn't in the API's TS lib, so that case counts with `filter`.
**Gate:** `pnpm run check` green (api 217).
**Notes:** none.

## Phase 3: Seed — 2026-10-16

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green; `test:int test/int/seed.int.test.ts` 8/8; full `test:int` green.
**Notes:** B5a closes here.

## Phase 4: Visits — 2026-10-16

**Steps completed:** 4.1, 4.2, 4.3, 4.4
**Files changed:** `apps/api/src/patients/patient-lock.ts` (new), `apps/api/src/patients/patient-writes.service.ts` (lock moved out, three now-unused imports dropped), `apps/api/src/clinic/clinic.service.ts` (`isActiveDentist`), `apps/api/src/visits/visits.{service,controller,module}.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts` (new), `apps/api/test/int/visits.int.test.ts` (new)
**Deviations from plan:** the int test's fixed clock moves on one second between steps (`tick()`): audit rows are ordered by `at`, and a 30-minute jump would idle the session out. The deactivated-dentist case runs last because it deactivates `staff_santos`.
**Gate:** `pnpm run check` green (api 220); `test:int test/int/visits.int.test.ts` 10/10.
**Notes:** none.

## Phase 5: Chart — 2026-10-16

**Steps completed:** 5.1, 5.2
**Files changed:** `apps/api/src/chart/chart.{service,controller,module}.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/chart.int.test.ts` (new); and, from the defect below, `apps/api/src/patients/patient-lock.ts`, `apps/api/src/visits/visits.service.ts`, `apps/api/test/int/visits.int.test.ts`
**Deviations from plan:**
- **Plan defect, fixed (InnoDB snapshot).** The plan's `lockedVisit` read the visit before `lockPatient`, and `complete` read the visit with `findUnique` before locking. Under MySQL's REPEATABLE READ the snapshot starts at the first plain read, so reads after the lock didn't see what the request holding the lock had just committed. Parallel corrections then hit the unique `supersedes` backstop and answered 500, and parallel completes all answered 200. Fix: `patient-lock.ts` gains `lockPatientIfExists` (a locking read that doesn't 404, so an unknown patient still answers the chart's "Visit not found for this patient"), which `lockedVisit` takes before any read. `complete` reads the visit's patient with a raw `SELECT … FOR UPDATE` (visit, then patient: no B5 path locks them in the other order). New case in `visits.int.test.ts`: "completes a visit exactly once under parallel requests". It fails without the fix (10× 200) and passes with it.
- `chart.int.test.ts`: the cross-clinic case picks a patient other than the one the repository-level case gave a backstop correction to. The upsert attempt names `clinicId`, which its create type requires.
**Gate:** `pnpm run check` green (api 223); `test:int` 24 files, 181 passed + 5 todo.
**Notes:** B5b closes here. The snapshot rule goes into CONVENTIONS in Phase 7.

## Phase 6: Last visit in the summaries — 2026-10-16

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `apps/api/src/visits/visit-days.{service,module}.ts` (new), `apps/api/src/patients/{patient.views,patient.views.test,patients.service,patients.module}.ts`, `apps/api/test/int/patients-read.int.test.ts`, `apps/api/test/int/visits.int.test.ts`
**Deviations from plan:** none (no unit test constructs `PatientsService` by hand, so nothing needed a stub).
**Gate:** `pnpm run check` green (api 224); `test:int` 24 files, 182 passed + 5 todo.
**Notes:** none.

## Phase 7: Cut-over — 2026-10-16

**Steps completed:** 7.1, 7.2, 7.3
**Files changed:** `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`, `apps/web/e2e/api-chart.spec.ts` (new), `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`, `CONVENTIONS.md`
**Deviations from plan:**
- `passthrough.test.ts`: B4's case asserted `GET /patients/p1/visits` stayed mocked; that assertion moves to the B5 list (served) and the neighbours (growth, notes, plan) are asserted mocked.
- The fresh database was made with the `mysql` client as `pedia` (no docker here); the API ran with `pnpm dev:api` and the web with `next dev` on `.next-hybrid`, as in B3. Run with an uncommitted `playwright.tmp.config.ts` (workers 1, chromium path).
- CONVENTIONS also records the snapshot trap from Phase 5 (lock before the first plain read) and the lock order (visit then patient in `complete`); the plan's trap (1) wording ("looks the visit up once before the lock") is replaced, since that lookup was the defect.
**Gate:** `pnpm run check` green; `test:int` green (Phase 6); `e2e/api-chart.spec.ts` 3/3 twice in a row on `pedia_dental_e2e_b5`.
**Notes:** B5c closes here. API on :4110 and hybrid web on :3160 left running for the tester.
