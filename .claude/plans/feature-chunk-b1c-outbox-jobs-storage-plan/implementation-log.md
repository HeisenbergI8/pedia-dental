# Implementation log: Chunk B1-c — outbox, scheduled jobs and file storage

## Phase 1: Tables — 2026-10-16
**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_outbox_jobs/`, `apps/api/src/prisma/model-scope.ts`
**Deviations from plan:** none.
**Gate:** `test -f apps/api/src/generated/prisma/models/OutboxMessage.ts` true after `db:migrate` + `db:generate`; `pnpm run typecheck` green.

## Phase 2: Environment, `JobRunner` and the background switch — 2026-10-16
**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/config/{env,env.test}.ts`, `apps/api/.env.example`,
`apps/api/.gitignore`, `apps/api/src/jobs/{job-runner,jobs.module}.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green after 2.1; `pnpm run typecheck` green after 2.2.

## Phase 3: The sweeps B2 deferred — 2026-10-16
**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `apps/api/src/auth/{session.service,rate-limit,auth.jobs,auth.module}.ts`, `apps/api/test/int/support/int-app.ts`,
`apps/api/test/int/jobs.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run typecheck`; `pnpm run check` (api 122); `test:int test/int/jobs.int.test.ts` green (4): with two app
instances on one database one sweep runs and the other skips, and the sweep removes only dead rows.

## Phase 4: Outbox — 2026-10-16
**Steps completed:** 4.1, 4.2, 4.3, 4.4
**Files changed:** `apps/api/src/outbox/{outbox.handlers,outbox.service,outbox.worker,outbox.worker.test,outbox.jobs,outbox.module}.ts`,
`apps/api/src/app.module.ts`, `apps/api/test/int/outbox.int.test.ts`
**Deviations from plan:** `NoopHandler.handle` takes the envelope (`_message: OutboxEnvelope`), as the `OutboxHandler`
interface does: the plan's zero-argument version made the int test's `vi.spyOn(...).mockImplementation(async (m) => …)`
fail to typecheck.
**Gate:** `pnpm run check` (api 124); `test:int outbox + jobs` green (10 tests), three runs in a row: 120 rows across two
workers each handled once, retry then fail without the error text, clinic context in handlers, lease takeover.
**Notes:** Follow Up Q1 (destroy order) was not probed mid-drain; closing a `background: true` app in jobs.int.test.ts
shuts down cleanly. A lost settle on shutdown is re-sent after its lease (at least once), as the plan says.

## Phase 5: Storage — 2026-10-16
**Steps completed:** 5.1, 5.2
**Files changed:** `apps/api/src/storage/{storage,local-disk.storage,storage.service,storage.module,storage.test}.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run typecheck`; `pnpm run check` (api 131, 7 storage tests in a temp directory).

## Phase 6: Docs and the closing run — 2026-10-16
**Steps completed:** 6.1
**Files changed:** `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** the current-phase line was rewritten to cover B1 and B2 together (it still described B2c).
**Gate:** `pnpm run check` green (shared 186, seed 19, api 131, web 342); `pnpm --filter api test:int` green, 72 tests.

## Review follow-up — 2026-10-16
**From the tester:** two mutations survived the suite. Without `SKIP LOCKED` claims just serialise; without the
`attempts` match on settle, the lease test's late worker settled `done`, the same value as the new claim. Two
`outbox.int.test.ts` cases added: a late worker's *failure* must not undo a newer claim's success (`lastError` stays
null), and a claim must skip a row another transaction holds `FOR UPDATE` instead of waiting (5 s race). Mutation
checks: each mutant now fails its new case; restored, the suite passes (74 tests).
**From the auditor:** the at-least-once trap now says to pass the row id as the provider's idempotency key, and
`jobs.int.test.ts` checks `outbox.prune` is scheduled too. The auditor's runtime probe answered Q1: an app closed
mid-handler finished and settled its batch before Prisma disconnected.
