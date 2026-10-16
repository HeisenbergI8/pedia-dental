# Implementation log: Chunk B2b — Identity models, seed, argon2id, sessions and the access guard

## Phase 1: Environment, the env-literal test, and hashing — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/src/config/{env,env.test}.ts`, `apps/api/test/app.test.ts`, `apps/api/.env.example`,
`apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/auth/{hashing,hashing.test}.ts`
**Deviations from plan:** The plan assumed `z.stringbool()` refuses `"yes"`; Zod 4's default also accepts
yes/on/y/enabled, so the plan's own test failed. The flags now use `z.stringbool({ truthy: ["true", "1"], falsy:
["false", "0"] })` (a `flag()` helper in env.ts), which is what the plan intended: a typo stops startup.
**Gate:** `pnpm run typecheck` green after 1.1; `pnpm run check` green after 1.2 (api 89).
**Notes:** the local `apps/api/.env` (git-ignored) got `DEMO_LOGINS=true` and `COOKIE_SECURE=false`.
`grep -rn "AppModule.forRoot({" apps/api` returns nothing.

## Phase 2: Identity models and migration — 2026-10-16

**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016071136_identity/migration.sql`,
`apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`,
`apps/api/test/int/identity-tenancy.int.test.ts`
**Deviations from plan:** Table names: Prisma defaults, as recommended (settled on the user's behalf with the
architect's recommendation; reported to the user). In `identity-tenancy.int.test.ts` the raw count reads
`const [row] = …; row!.n` instead of destructuring `[{ n }]`, which fails `noUncheckedIndexedAccess`.
**Gate:** `pnpm run typecheck` green after 2.1 (11 `CREATE TABLE`, 0 `FOREIGN KEY` in the migration); `pnpm run
check` green after 2.2; `pnpm --filter api test:int` green (13 tests).

## Phase 3: `prisma db seed` from `@pedia/seed` — 2026-10-16

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/package.json`, `apps/api/prisma.config.ts`, `apps/api/prisma/seed.ts`,
`apps/api/src/seed/{seed-database,seed-database.test}.ts`, `apps/api/test/int/seed.int.test.ts`, `apps/api/tsconfig.json`
**Deviations from plan:** `prisma/seed.ts` added to the API's tsconfig `include`, so `pnpm run typecheck` covers it
(it was outside every included path). Same `row!.n` change in `seed.int.test.ts`.
**Gate:** `pnpm run typecheck` green after 3.1; `pnpm run check` green after 3.2; `test:int test/int/seed.int.test.ts`
green (5 tests). By hand: `prisma migrate reset --force --skip-seed`, then `DEMO_LOGINS=true pnpm --filter api db:seed`
→ "Seeded the demo clinics." (3 accounts, 11 staff, 75 credentials in `pedia_dental`); a second run →
`SeedRefused: … 3 clinic account(s) already exist`, exit 1.

## Phase 4: Server-side sessions — 2026-10-16

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/src/auth/{cookies,session.service,identity.service,session.service.test}.ts`,
`apps/api/test/int/sessions.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run typecheck` green after 4.1; `pnpm run check` green after 4.2; `test:int test/int/sessions.int.test.ts`
green (7 tests: hash-only storage, 30 min idle, 8 h absolute, operator/clinic tokens apart, suspended staff refused and
parents read-only, foreign `pd_branch` ignored, parallel PIN tries counted and locked).

## Phase 5: The route → permission map — 2026-10-16

**Steps completed:** 5.1
**Files changed:** `apps/api/src/auth/{access-rules,access-rules.test}.ts`
**Deviations from plan:** `webRules` asserts the regex groups non-null (`method!`, `path!`) for `noUncheckedIndexedAccess`.
**Gate:** `pnpm run check` green. Mutation check: removing the `/reports/today` rule from `access-rules.ts` fails the
drift test; restored, it passes.

## Phase 6: The access guard — 2026-10-16

**Steps completed:** 6.1, 6.2
**Files changed:** `apps/api/src/auth/{access.guard,auth.module}.ts`, `apps/api/src/common/request-context.ts`,
`apps/api/src/app.module.ts`, `apps/api/test/support/test-app.ts`, `apps/api/test/{app,request-context,logging,access-guard}.test.ts`,
`apps/api/test/int/access-guard.int.test.ts`, `apps/api/vitest.int.config.ts`
**Deviations from plan:** Same `row!.n` change in the int test. `vitest.int.config.ts` now imports
`./test/int/support/database-url.ts` with its extension: Vite warned that an extensionless import won't work under its
future native config loader.
**Gate:** `pnpm run check` green after 6.1 (api 108); `pnpm run typecheck` green after 6.2; `pnpm --filter api test:int`
green, all 32 tests (health, tenancy, transaction, identity-tenancy, seed, sessions, access-guard). The plan's seed
assumption held: every featured login (each role, both clinics of `dentist@gmail.com`, the Ngiti owner) passes the
acknowledgement gate.

## Phase 7: Record it — 2026-10-16

**Steps completed:** 7.1
**Files changed:** `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** also fixed the stale "(P2034)" in the `runInTransaction` trap (B2a audit finding).
**Gate:** prose.
