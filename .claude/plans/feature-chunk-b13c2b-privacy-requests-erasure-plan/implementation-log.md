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
