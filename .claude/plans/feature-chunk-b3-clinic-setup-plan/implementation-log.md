# Implementation log: Chunk B3 — clinic setup and Owner settings

One entry per phase, added when its gate passes. Format (as B2d):

```
## Phase N: <name> — <date>
**Steps completed:** N.1, N.2
**Files changed:** …
**Deviations from plan:** none | what and why
**Gate:** <commands> → result
```

## B3a — Reference data on MySQL

<!-- Phase 1: Tables -->
<!-- Phase 2: Seed -->
<!-- Phase 3: Reference reads and message templates -->

## B3b — Profile, look and logo

<!-- Phase 4: Profile and branding -->
<!-- Phase 5: The logo -->

## B3c — Branches, staff and the tier limits

<!-- Phase 6: Limits and usage -->
<!-- Phase 7: Branch writes -->
<!-- Phase 8: Staff writes -->
<!-- Phase 9: owner-settings.test.ts on MySQL -->

## B3d — Cut-over

<!-- Phase 10: Serve B3's routes in hybrid -->
<!-- Phase 11: The Owner's Settings in a browser, against the API -->
<!-- Phase 12: Record it -->

## Phase 1: Tables — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016121045_clinic_setup/migration.sql`, `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`
**Deviations from plan:** `migrate dev` refuses to run non-interactively because of the unique-index warning, so the SQL came from `prisma migrate diff --from-config-datasource --to-schema` into a hand-named migration directory, applied with `db:deploy` (`migrate status`: up to date). The SQL is what `migrate dev` would have written.
**Gate:** `pnpm run typecheck` green; `test -f apps/api/src/generated/prisma/models/MessageTemplate.ts` OK.
**Notes:** none.

## Phase 2: Seed — 2026-10-16

**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** none (`byPosition` hoisted out of the loop).
**Gate:** `pnpm run check` green (api 131, web 342); `test:int test/int/seed.int.test.ts` 6/6.
**Notes:** `fields` (Json) needed no cast.

## Phase 3: Reference reads and message templates — 2026-10-16

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `apps/api/src/clinic/clinic.{service,controller}.ts`, `apps/api/src/notes/notes.{module,controller,service}.ts` (new), `apps/api/src/messages/messages.{module,controller,service}.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinic-routes.test.ts` (new), `apps/api/test/int/clinic-reference.int.test.ts` (new)
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 136); `test:int test/int/clinic-reference.int.test.ts` 7/7.
**Notes:** B3a closes here.

## Phase 4: Profile and branding — 2026-10-16

**Steps completed:** 4.1, 4.2
**Files changed:** `apps/api/src/clinic/account-lock.ts` (new), `apps/api/src/clinic/clinic.{views,views.test,service,controller}.ts`, `apps/api/test/clinic-routes.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 139).
**Notes:** none.

## Phase 5: The logo — 2026-10-16

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/clinic/logo.ts` + `logo.test.ts` (new), `apps/api/src/clinic/account-lock.ts`, `apps/api/src/storage/delete-file.handler.ts` (new), `apps/api/src/storage/storage.module.ts`, `apps/api/src/storage/storage.test.ts`, `apps/api/src/clinic/clinic.{module,service,controller}.ts`, `apps/api/test/clinic-routes.test.ts`, `apps/api/test/int/clinic-branding.int.test.ts` (new)
**Deviations from plan:**
- Versions: `dompurify@3.4.16` and `jsdom@29.1.1` (newest at least two weeks old whose engines accept this machine's Node 22.22.0; jsdom 30 needs ^22.22.2), `@types/jsdom@28.0.3`.
- `storage.test.ts` (not in the plan) broke: StorageModule now imports OutboxModule, whose worker needs PrismaService. The test overrides OutboxModule with a stand-in that provides only `OutboxHandlers`, and gains a case proving `storage.delete` registers.
- `logo.test.ts` also asserts `viewBox` keeps its case (the plan's Issue on HTML serialisation).
**Gate:** `pnpm run check` green (api 148); `test:int test/int/clinic-branding.int.test.ts` 8/8; full `test:int` 16 files / 90 tests green.
**Notes:** B3b closes here.
