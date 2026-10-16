# Implementation log: Chunk B2a — Shared seed, `test:int` harness and the cut-over switch

## Phase 1: The `@pedia/seed` package — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `packages/seed/{package.json,tsconfig.json,vitest.config.ts}`, `packages/seed/src/{index,platform,logins}.ts`,
the moved seed files (`seed*.ts`, `note-templates.ts`, `message-templates.ts`, `seed.test.ts`), `apps/web/src/mocks/{db,demo-accounts,operator,outbox,signups}.ts`,
`apps/web/src/mocks/{cross-branch,operator}.test.ts`, `apps/web/src/features/{auth,operator,signup}/mocks.ts`,
`apps/web/src/design/design-tokens.test.ts`, `apps/web/next.config.ts`, `apps/web/package.json`, `pnpm-lock.yaml`
**Deviations from plan:** The package extends `tsconfig.base.json`, which has `noUncheckedIndexedAccess`; the web's
tsconfig doesn't, so the moved `seed.ts` and `logins.ts` failed with 47 index-access errors. The API (also on the
base config) will type-check these files when B2b imports the package, so the code was made to pass rather than
loosening the package's config: non-null assertions on lookups into the seed's own fixed data (`patients[3]!`,
`STAFF_PINS[s.id]!`, `visits as [Visit, ...Visit[]]`, `as const` on the chair/dentist pairs). Types only; the
values and faker call order are unchanged, which `seed.test.ts`'s "unchanged first patients" check confirms.
`OPERATORS` moved with its original doc comment, shortened. `demo-accounts.ts` also imports `DemoAccountRecord`
(its token helpers use the type).
**Gate:** `pnpm run check` green: shared 186, seed 19 (moved from web), api 81, web 333 (352 − 19).
**Notes:** `transpilePackages` gains `@pedia/seed`; first exercised by `next dev` in B2d.

## Phase 2: The `test:int` harness — 2026-10-16

**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/{vitest.config.ts,vitest.int.config.ts,package.json,tsconfig.json,.env.example}`,
`apps/api/docker/mysql-init.sql`, `apps/api/test/int/support/{database-url,global-setup,database,int-app}.ts`,
`apps/api/test/int/health.int.test.ts`
**Deviations from plan:** none. The local `apps/api/.env` (git-ignored) also got `TEST_DATABASE_URL`.
**Gate:** `pnpm run check` green (api 81, `test/int/**` excluded); `pnpm --filter api test:int` green (2 tests) against
local MySQL 8.0.46 on 127.0.0.1:3307. The test:int Verify lines aren't on the plan allowlist, so they were run by hand.
**Notes:** MySQL was installed in this container with apt (`mysql-server` 8.0.46) and started with
`mysqld --user=mysql --port=3307 --bind-address=127.0.0.1 --daemonize`, user `pedia`/`pedia`, databases
`pedia_dental`, `pedia_dental_shadow`, `pedia_dental_test`. It doesn't survive the container.

## Phase 3: MySQL proofs of B1-a, and CI — 2026-10-16

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `apps/api/test/int/{tenancy,transaction}.int.test.ts`, `apps/api/src/prisma/transaction.ts`,
`apps/api/src/prisma/transaction.test.ts`, `.github/workflows/api.yml`
**Deviations from plan:**
- **The plan's P2034 assumption was wrong for raw queries.** A deadlock inside `$queryRaw` (`SELECT … FOR UPDATE`)
  reaches Prisma as **P2010** with `meta.driverAdapterError.cause = { kind: "TransactionWriteConflict",
  originalCode: "1213" }`, not P2034. As the plan said, the fix went into `isWriteConflict`, not the test:
  it is now exported and accepts P2034, or P2010 wrapping `TransactionWriteConflict`. Two unit cases cover it
  (a retry after the wrapped form; a P2010 with another kind is not retried). The integration test asserts the
  exact observed shape and `isWriteConflict(...) === true`. Before the fix, both integration cases failed
  (`code: 'P2010'`); after it, both pass.
- CI uses `node-version-file: .nvmrc` (Node 20) instead of a hard-coded 22, to match the repo's pin.
**Gate:** `pnpm run check` green (api 83 tests); `pnpm --filter api test:int` green (8 tests), 6 runs in a row.
`test -f .github/workflows/api.yml` true. The workflow itself first runs on push.
**Notes:** whether a deadlock in a *model* query reports P2034 through this adapter is still unobserved; both
forms are retried.

## Phase 4: The web's cut-over switch — 2026-10-16

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/web/src/lib/env.ts`, `apps/web/src/mocks/{passthrough,passthrough.test,access,browser}.ts`,
`apps/web/next.config.ts`
**Deviations from plan:** none (`match` → `matchPath` in its three call sites, as planned).
**Gate:** `pnpm run check` green (web 336 = 333 + 3 passthrough tests); `pnpm run typecheck` green after 4.2.
**Notes:** nothing listens on `localhost:80` here, so the passthrough test's "reaches the network" case holds.

## Phase 5: Record it — 2026-10-16

**Steps completed:** 5.1
**Files changed:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** also recorded the P2010 deadlock finding as an API trap. The "Run against the real API"
command row was added to root CONVENTIONS in place of separate env-variable rows.
**Gate:** prose. `pnpm run check` re-run at close.
