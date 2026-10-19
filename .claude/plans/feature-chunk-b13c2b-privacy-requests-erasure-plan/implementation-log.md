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
