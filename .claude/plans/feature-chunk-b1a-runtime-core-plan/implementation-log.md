# Implementation log: Chunk B1-a — Runtime core

## Phase 1: Request context — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/src/common/request-context.ts`, `apps/api/src/common/request-context.middleware.ts`,
`apps/api/src/app.module.ts`, `apps/api/test/support/test-app.ts`, `apps/api/src/common/request-context.test.ts`,
`apps/api/test/request-context.test.ts`
**Deviations from plan:** The malformed-id case sends `"bad id {}"` instead of `"bad id\n{}"`: Node refuses to send
a header containing a newline, so the request would fail client-side before reaching the middleware. The space and
braces still fail the well-formed pattern, so the case tests the same rule.
**Gate:** `pnpm --filter api typecheck` and `pnpm --filter api test` green (4 files, 15 tests). `{*splat}` works on
Nest 12: the unknown-route test gets an id.
**Notes:** The stack trace in test output is `test/app.test.ts`'s intentional 500 (CONVENTIONS → Traps).

## Phase 2: Clock — 2026-10-16

**Steps completed:** 2.1
**Files changed:** `apps/api/src/common/clock.ts`, `apps/api/src/common/clock.test.ts`, `apps/api/src/app.module.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check` green (api 5 files, 18 tests).
**Notes:** none

## Phase 3: Structured logs — 2026-10-16

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/config/env.ts`,
`apps/api/src/config/env.test.ts`, `apps/api/.env.example`, `apps/api/test/app.test.ts`,
`apps/api/src/logging/logger.ts`, `apps/api/src/logging/logger.test.ts`, `apps/api/src/app.module.ts`,
`apps/api/src/main.ts`, `apps/api/src/common/http-error.filter.ts`, `apps/api/test/support/test-app.ts`,
`apps/api/test/logging.test.ts`
**Deviations from plan:** `env.test.ts` tests defaults one by one, so it gained `LOG_LEVEL: "info"` as the plan's
condition said. In `test/logging.test.ts` the `x-request-id` header is non-null-asserted (`!`):
`noUncheckedIndexedAccess` types it `string | undefined`.
**Gate:** `pnpm --filter api typecheck` green after 3.1; `pnpm run check` green after 3.2 (api 7 files, 42 tests).
**Notes:** Mutation check: with `HttpErrorFilter` reverted to `this.logger.error(exception)`, the "database error
without the patient data" test fails; restored, it passes. The Prisma 7 `PrismaClientValidationError(message,
{ clientVersion })` constructor works as the plan assumed. The local `apps/api/.env` (git-ignored) also got
`LOG_LEVEL=info`.

## Phase 4: Tenant scoping and the first model — 2026-10-16

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/migration_lock.toml`,
`apps/api/prisma/migrations/20261016000000_audit_events/migration.sql`, `apps/api/src/prisma/model-scope.ts`,
`apps/api/src/prisma/tenant-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`,
`apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.service.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm --filter api typecheck` green after 4.1 (client regenerated); `pnpm --filter api typecheck` and
`pnpm --filter api test` green after 4.2 (9 files, 70 tests); full `pnpm run check` run at the Phase 5 gate.
**Notes:** Migration SQL is exactly what `prisma migrate diff --from-empty` wrote; not applied to any database yet
(B1-b). `return this.$extends(...)` from the constructor works on Prisma 7.10: `onModuleDestroy` survives.
Mutation check: with the `return this.$extends(...)` line removed, both query tests in `prisma.service.test.ts`
fail (connection timeout instead of the refusal); restored, all pass.

## Phase 5: Transactions and the audit writer — 2026-10-16

**Steps completed:** 5.1, 5.2
**Files changed:** `apps/api/src/prisma/transaction.ts`, `apps/api/src/prisma/transaction.test.ts`,
`apps/api/src/audit/audit.service.ts`, `apps/api/src/audit/audit.module.ts`, `apps/api/src/audit/audit.service.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm --filter api typecheck` green after 5.1; `pnpm run check` green after 5.2 (api 11 files, 80 tests;
shared 186; web 352).
**Notes:** `Prisma.TransactionClient` matched the scoped client's `tx` without a type change.

## Phase 6: Record the decisions in CONVENTIONS.md — 2026-10-16

**Steps completed:** 6.1
**Files changed:** `apps/api/CONVENTIONS.md`
**Deviations from plan:** The three decisions went into a new "Decisions recorded" section rather than being
scattered, since the file had no place for them. `LOG_LEVEL` isn't listed as its own trap: the existing `.env` trap
already says a new variable goes in `Env`, `.env.example` and `.env`, which is what was done.
**Gate:** prose; no check (as planned). `pnpm run check` re-run at close.
**Notes:** Not implemented from the plan's Follow Ups (by design, they are questions): branch widening for Owner
reports, operator audit, table names, the check allowlist, `customProps` for `requestId`, `pino-pretty`.

## Review follow-up — 2026-10-16

**From the tester:** Prisma queries are lazy, so `requestContext.run(ctx, () => prisma.x.findMany())` runs the
query outside the context. Added a trap for it to `apps/api/CONVENTIONS.md` (not in Step 6.1's list).
**From the auditor (Finding 1):** `prisma.service.test.ts`'s in-clinic case didn't await inside the context, so it
passed without the clinic reaching the extension. It now awaits inside `run`, and a new case proves the context
arrives: clinic A naming `clinic_b` is refused as a mismatch (without the context it would be "needs a clinic").
**Left as is:** requests outside `/api` (e.g. `GET /`) get no request id, because Nest prefixes the middleware's
route; the API serves only `/api`. The injected client isn't `instanceof PrismaService` (the constructor returns the
extended client); nothing checks that.
