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

## Phase 4: Growth — 2026-10-16

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `apps/api/src/visits/visits.service.ts` (`patientOf`, `one`), `apps/api/src/growth/growth.{service,controller,module}.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts` (B6 table), `apps/api/test/int/clinical-support.ts` (new), `apps/api/test/int/growth.int.test.ts` (new), `packages/seed/src/seed.ts`
**Deviations from plan:**
- **Seed defect, fixed.** The seed stamped both growth records of an example pair at `<visit day>T04:00`. When the pair's two visits fall on one day (they did for the inferred-stop example on today's run), the records tie. MSW keeps insertion order on the tie; the API's id tie-break reversed them, so `habitTimeline` lost the inferred stop. The second visit's record is now a minute later (`later` flag in `seedGrowth`). Seed tests are still green.
- The B6 int files share `test/int/clinical-support.ts` (sign-in, register, start, complete, audit lookup) instead of copying B5's header three times.
- Mutation check done (plan asked): with `lockPatient` removed from `GrowthService.save`, both race cases go red.
**Gate:** `pnpm run check` green; `growth.int.test.ts` 10/10.

## Phase 5: Treatment plan — 2026-10-16

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/api/src/clinic/clinic.service.ts` (`procedure`), `apps/api/src/plan/plan.{service,controller,module}.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/plan.int.test.ts` (new)
**Deviations from plan:** case 1 checks that each sourced item names a seeded chart entry on its own tooth; the seed sources three items (51, 74, 84), not the two the plan named. The parent case uses the example patient's own guardian (B4's `guardian.<id>` login) and `childrenOf`.
**Gate:** `pnpm run check` green (api 245); `test:int` 26 files, 202 passed + 5 todo. B6b closes here.

## Phase 6: Clinical notes — 2026-10-16

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `apps/api/src/notes/notes.{service,controller,module}.ts`, `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/notes.int.test.ts` (new)
**Deviations from plan:** the race cases run as `it.each` over three rounds (each a fresh child), so a round that fails is named.
**Mutation checks (plan asked):** each was undone byte-for-byte afterwards, compared with `cmp`.
- Lock and the `signedAt: null` guard removed from update and sign: the sign-once and edit-during-sign cases are red.
- Lock and the status guard removed from `setStatus`: the re-plan race is red in 2 of 3 rounds.
- `lockPatientIfExists` removed from `create`: the note-during-complete race is red in all 3 rounds.
**Gate:** `pnpm run check` green (api 249); `test:int` 27 files, 229 passed + 5 todo. B6c closes here.

## Phase 7: Cut-over — 2026-10-16

**Steps completed:** 7.1, 7.2, 7.3
**Files changed:** `apps/web/src/mocks/passthrough.ts`, `passthrough.test.ts`, `apps/web/e2e/api-notes-plan.spec.ts` (new), `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`, `CONVENTIONS.md`
**Deviations from plan:**
- The e2e signs a **follow-up** note (plan item "Follow-up", template "Follow-up visit", Healing select) rather than a pulpotomy: the pulpotomy form's tooth picker has no selector used by any existing spec, and the follow-up flow proves the same three things through the UI (POST/PUT/sign answered by the API, "Signed" with no "Edit or sign", the plan going 0 → 1 of 1 done) plus the 409s via `page.request`. The pulpotomy done-when is `notes.int.test.ts` case 1.
- CONVENTIONS also records the seed-tie trap (Phase 4).
**Gate:** `pnpm run check` green; `test:int` green (Phase 6); `e2e/api-notes-plan.spec.ts` 4/4 twice in a row on `pedia_dental_e2e_b6`.
**Notes:** B6d closes here. API :4110 and hybrid web :3160 left running for the tester.
