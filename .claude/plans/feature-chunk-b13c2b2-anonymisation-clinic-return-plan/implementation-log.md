# B13c2b-2 implementation log

Open questions settled by the session's safe defaults (user rule: deleting parts ship off, confirm with counsel): Q1 bundled one-off release task (no infra change); Q2 anonymise only children with an approved erasure request.

## Phase 1: Contracts: retention periods as data — 2026-10-19

**Steps completed:** 1.1
**Files changed:** `packages/shared/src/domain/retention.ts` (new), `packages/shared/src/domain/retention.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check` exit 0 (shared 251 tests / 32 files, api 553 / 84, web 415 / 36, infra 41, seed 31). The api run prints an "Unhandled error" rxjs stack that does not fail the run (pre-existing log noise, unrelated to this phase).
**Notes:** `RECORD_RETENTION` ships `{ null, null }` (confirm with counsel).

## Phase 2: Schema and the switch — 2026-10-19

**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261021000000_b13c2b2_anonymisation/migration.sql` (new), `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/.env.example`, `apps/api/src/patients/patient.views.test.ts`
**Deviations from plan:** `patient.views.test.ts`'s typed Patient row fixture gains `anonymisedAt: null` (tsc requires every column; one-word fixture fix, not in the plan's file list).
**Gate:** `pnpm run check` exit 0 (api 554 tests / 84 files, shared 251, web 415, infra 41, seed 31). Migration generated with `prisma migrate diff --from-config-datasource` against `pedia_dental_b13c2b2_test` (deployed to the previous migration first); content matches the plan exactly. `db:deploy` + `db:generate` run on that `_test` DB; `db:drift` reports no difference.
**Notes:** the local dev database (`.env`) was not touched; only the `_test` DB was migrated.
