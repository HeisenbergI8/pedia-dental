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
