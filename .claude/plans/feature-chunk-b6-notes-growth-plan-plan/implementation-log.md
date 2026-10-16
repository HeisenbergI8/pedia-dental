# Implementation log: Chunk B6, Notes, growth, behavior and the treatment plan

Plan: `feature-chunk-b6-notes-growth-plan-plan.md`. One entry per phase, in B5's shape. Record deviations from the plan
as they happen, with the reason; "none" when there are none.

## Phase 1: Tables — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int`
**Notes:** (was the dev database at B5's head before `migrate diff`? what the SQL held)

## Phase 2: Shapes and rules — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`
**Notes:** (did the `Refusal` move leave chart's tests green?)

## Phase 3: Seed — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/seed.int.test.ts`
**Notes:** (did the example plan exist on the run date? B6a closes here)

## Phase 4: Growth — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/growth.int.test.ts`
**Notes:** (race cases 9–10: answers per round; red with `lockPatient` removed?)

## Phase 5: Treatment plan — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int test/int/plan.int.test.ts`
**Notes:** (which parent login and child the parent case used; B6b closes here)

## Phase 6: Clinical notes — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int`
**Notes:** (race cases 13–17: answers per round; which mutation turned each red; B6c closes here)

## Phase 7: Cut-over — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check`; `pnpm --filter api test:int`; `E2E_API=1 E2E_BASE_URL=http://localhost:3160 npx playwright test e2e/api-notes-plan.spec.ts --project=desktop` (twice in a row)
**Notes:** (database name, ports, whether `apps/web/tsconfig.json` had to be reverted; B6d closes here)

## Decisions confirmed by the user — 2026-10-16

Asked before building (grill): any clinical staff may sign a draft (decision 5); signing updates only the plan until B7/B9 move recalls and messages (decision 1); no ownership check on a plan item's source finding yet (decision 4); the Manila-midnight habit-date issue waits for B13 (decision 8). Decisions 2, 3, 6, 7 and 9 as the plan recommends.

## Phase 1: Tables — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016154734_notes_growth_plan/migration.sql`, `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`
**Deviations from plan:** MySQL had stopped, so the first `migrate diff` wrote an empty file. `db:deploy` then recorded the migration as failed in the dev database. It was marked `migrate resolve --rolled-back` (nothing had applied), regenerated and deployed. The committed SQL is the plan's: 3 tables, 3 indexes, 1 unique.
**Gate:** `pnpm run check` green (api 225); `test:int` 24 files green.

## Phase 2: Shapes and rules — 2026-10-16

**Steps completed:** 2.1–2.5
**Files changed:** `apps/api/src/notes/note.rows.ts` + test, `apps/api/src/growth/growth.rows.ts` + test, `apps/api/src/plan/plan.rows.ts` + test, `apps/api/src/common/refusal.ts` (new), `apps/api/src/notes/note.rules.ts` + test, `apps/api/src/plan/plan.rules.ts` + test, `apps/api/src/chart/chart.{rules,service}.ts` (Refusal and refuse moved out)
**Deviations from plan:** the note and growth round-trip tests cast the seed's input row to the stored row's type in one helper each, because Prisma types JSON input (`InputJsonValue`) and output (`JsonValue`) differently.
**Gate:** `pnpm run check` green (api 240).

## Phase 3: Seed — 2026-10-16

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green; `test:int` 24 files, 184 passed + 5 todo. B6a closes here.
