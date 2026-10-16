# Implementation log: Chunk B2c — auth endpoints, rate limiting, and the clinic reads

## Phase 1: Rate-limit counters — 2026-10-16
**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016072447_rate_limit/`, `apps/api/src/prisma/model-scope.ts`, `apps/api/src/auth/{rate-limit,rate-limit.test}.ts`
**Deviations from plan:** none. Prisma 7's `migrate dev` did not regenerate the client, so `db:generate` was run by hand (recorded as a trap).
**Gate:** `pnpm run typecheck` green after 1.1; `pnpm run check` green after 1.2.

## Phase 2: Clinic sign-in endpoints — 2026-10-16
**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/src/common/request-context.ts` (`within`), `apps/api/src/auth/{identity.service,access.guard,auth.service,auth.controller,auth.module}.ts`, `apps/api/test/auth.test.ts`
**Deviations from plan:** none at this step (see Phase 3 for `demoLogins`).
**Gate:** `pnpm run typecheck` green after 2.1; `pnpm run check` green after 2.2 (api 116).

## Phase 3: Sign-in and rate limits on MySQL — 2026-10-16
**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/test/int/{auth-sign-in,rate-limit}.int.test.ts`, `apps/api/src/auth/identity.service.ts`
**Deviations from plan:** **bug in the plan's `demoLogins`**: it sorted featured logins by screen position, so the sign-in
page listed dentist, front desk, admin, owner; the mock (`packages/seed/src/logins.ts`) sorts each clinic's logins by
`Role.options`. The plan's own test caught it. Now sorted by role rank, then position.
**Gate:** `pnpm run typecheck`; `pnpm run check`; `test:int auth-sign-in + rate-limit` green (10). The plan's open
question held: `DemoLogin.featured` is set in both clinics for `dentist@gmail.com`.

## Phase 4: Switch, password and acknowledgement — 2026-10-16
**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/src/auth/{identity.service,auth.service,auth.controller}.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/int/auth-steps.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 117); `test:int auth-steps` green (6).

## Phase 5: Operator sign-in — 2026-10-16
**Steps completed:** 5.1, 5.2
**Files changed:** `apps/api/src/auth/{operator-auth.controller,identity.service,auth.service,auth.module}.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/int/operator-auth.int.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 119); `test:int operator-auth` green (4).

## Phase 6: Clinic reads and the ported tenancy cases — 2026-10-16
**Steps completed:** 6.1, 6.2
**Files changed:** `apps/api/src/clinic/*`, `apps/api/src/app.module.ts`, `apps/api/test/int/clinic-tenancy.int.test.ts`,
plus the list-order deviation below: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_list_order/`,
`apps/api/src/seed/seed-database.ts`, `apps/api/src/auth/identity.service.ts`, `apps/api/src/clinic/clinic.service.ts`
**Deviations from plan:** The plan's open "branch order" question was settled with its own recommendation (a
`position` column), applied to `Staff` too, since `/staff` had the same id-order difference from the mock. New
migration `list_order` (`Branch.position`, `Staff.position`, default 0); the seed writes each list's array index;
branches and staff are ordered by `position, id`. The tenancy test now asserts the mock's exact orders (Imus before
Dasmariñas, staff in seed order) instead of sorted ids, and a new case checks a two-branch dentist starts at Imus.
**Gate:** `pnpm run check` green (api 122); `pnpm --filter api test:int` green (62).

## Phase 7: Record it — 2026-10-16
**Steps completed:** 7.1
**Files changed:** `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** the "branches are ordered by id" trap was replaced by the list-order one (position columns exist).
**Gate:** prose.
