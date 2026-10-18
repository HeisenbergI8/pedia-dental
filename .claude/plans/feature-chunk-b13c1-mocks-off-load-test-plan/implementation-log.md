# Implementation log: B13c1 mocks off, the port ledger, the API-backed demo and the load test

## Step 1.1, Step 1.3 and Phase 4 — 2026-10-18

**Steps completed:** 1.1 (harness), 1.3, 4.1, 4.2, 4.3, 4.4 (code; the e2e run is pending, see below)
**Files changed:** `apps/api/test/port-ledger{,.test}.ts` (new), `apps/web/src/mocks/passthrough.test.ts`, `apps/web/src/features/auth/demo{,.test}.ts` (new), `features/auth/api.ts`, `features/auth/components/{login-screen,switch-user-dialog,account-menu}.tsx`, `features/operator/components/operator-login.tsx`, `features/portal/api.ts`, `apps/web/.env.example` (new), `apps/web/.gitignore` (`!.env.example`), `README.md`, the six `api-*.spec.ts` start-up lines, `api-sign-in.spec.ts`, `apps/api/src/metrics/metrics.service.ts` (Q4 comment)
**Deviations from plan:**
- **The sweep found a second rule with no route:** `GET /audit-log` (`audit.view`, in both access maps) has no MSW handler, no API controller and no screen, like `POST /patients/:id/exports`. The rules sweep now expects both and names them as B13c2's (the audit-log reader belongs with the privacy work).
- **The sweep's handler filter** also skips handlers whose method is a RegExp: the access gate's `/.+/` catch-all.
- **`ENFORCED` starts empty** in this commit. The five small files join in Step 1.2 once their lines are confirmed against the test bodies, so `pnpm run check` stays green between commits.
- **`apps/web/.env.example`** was git-ignored by `apps/web/.gitignore`'s `.env*`; `!.env.example` was added so it can be committed.
- **The README's Run it section** also starts MySQL and seeds, as the plan's list implies.
**Gate:** `pnpm run check`: exit 0. `port-ledger.test.ts`: 2 passed, 13 todo. `passthrough.test.ts`: 7 passed.
**Notes:**
- The case mapping for all 13 web files is being proposed by five read-only agents into the scratchpad. Each line is confirmed against the test bodies before it lands.
- The Phase 4 e2e gate (every `api-*.spec.ts` against a `disabled` web) runs with Phase 5's demo-script spec.
