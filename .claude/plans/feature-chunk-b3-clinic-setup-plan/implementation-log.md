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

## Phase 6: Limits and usage — 2026-10-16

**Steps completed:** 6.1, 6.2
**Files changed:** `apps/api/src/clinic/limits.ts` + `limits.test.ts` (new), `apps/api/src/clinic/clinic.{service,controller}.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 151).
**Notes:** none.

## Phase 7: Branch writes — 2026-10-16

**Steps completed:** 7.1
**Files changed:** `apps/api/src/clinic/branches.service.ts` (new), `apps/api/src/clinic/clinic.{controller,module}.ts`, `apps/api/test/clinic-routes.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (api 156).
**Notes:** behaviour is proven on MySQL in Phase 9.

## Phase 8: Staff writes — 2026-10-16

**Steps completed:** 8.1, 8.2
**Files changed:** `apps/api/src/auth/secrets.ts` + `secrets.test.ts` (new), `apps/api/src/auth/identity.service.ts`, `apps/api/src/clinic/staff.service.ts` (new), `apps/api/src/clinic/clinic.{controller,module}.ts`
**Deviations from plan:** `newStaffSecrets` hashes the password and PIN in parallel (`Promise.all`) rather than one after the other.
**Gate:** `pnpm run check` green (api 157).
**Notes:** behaviour is proven on MySQL in Phase 9.

## Phase 9: owner-settings.test.ts on MySQL — 2026-10-16

**Steps completed:** 9.1, 9.2
**Files changed:** `apps/api/test/int/owner-settings.int.test.ts` (new), `apps/api/test/int/tier-limits.int.test.ts` (new), `apps/api/test/clinic-routes.test.ts` (now all 18 B3 routes)
**Deviations from plan:** the plan's port read two tenant tables (`Staff` for Joy's email, `AuditEvent` for the audit case) from the root client outside any request context, which the tenant extension refuses ("needs a clinic"). Both reads now run in `inClinic("clinic_ngiti", …)` and drop their explicit `clinicId`.
**Gate:** `pnpm run check` green (api 160); full `test:int` 18 files, 112 passed + 1 todo (B7 bookings). `tier-limits.int.test.ts` run 5 times in a row: green each time.
**Notes:** B3c closes here.

## Phase 10: Serve B3's routes in hybrid — 2026-10-16

**Steps completed:** 10.1
**Files changed:** `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (web 342).
**Notes:** no feature code, schema or mock handler changed.

## Phase 11: The Owner's Settings in a browser, against the API — 2026-10-16

**Steps completed:** 11.1
**Files changed:** `apps/web/e2e/api-owner-settings.spec.ts` (new)
**Deviations from plan:**
- Follow Up 5 resolved: user `pedia` may create databases, so the run used a new `pedia_dental_e2e_b3` (db:deploy + db:seed), not root.
- `fromServiceWorker()` is true for passed-through requests too (MSW fetches them from its worker), so the first test failed as the plan's Issue predicted. It now tells an API answer by Nest's `x-request-id` header (`fromApi`), asserting true for `/procedures` and `/clinic/usage` and false for MSW's `/clinic/subscription`.
- Run with an uncommitted `playwright.tmp.config.ts` (workers 1, the chromium executablePath).
**Gate:** `pnpm run typecheck` green. The spec passed 7/7 twice in a row against the same database (after a 5-minute rate-limit pause), then `api-sign-in.spec.ts` 10/10.
**Notes:** API on :4110 and hybrid web on :3160 (`NEXT_DIST_DIR=.next-hybrid`) left running for the tester.

## Phase 12: Record it — 2026-10-16

**Steps completed:** 12.1, 12.2
**Files changed:** `apps/api/CONVENTIONS.md`, `CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** besides the plan's text: two more API traps (the non-interactive `migrate dev` workaround from Phase 1, and overriding `OutboxModule` when a unit test builds `StorageModule`, from Phase 5); the root `hybrid` trap also says how to tell an API answer in Playwright (`x-request-id`, Phase 11); the root intro line names B3; the "Order at a glance" diagram ticks B1–B3.
**Gate:** none (prose).
**Notes:** none.

## Review fixes — 2026-10-16

**From:** tester (`verification.md`) and auditor.
**Fixed:** F1 / audit Finding 1 — `sanitizeSvg` returned DOMPurify's HTML string, so a non-breaking space became `&nbsp;` (not XML) and `<img>` showed a broken logo. It now sanitises to a DOM fragment and writes the `<svg>` root back with jsdom's `XMLSerializer`, accepting only a root in the SVG namespace (commit b281dd5). New unit case in `logo.test.ts`; the tester's `ink.svg` re-rendered in Chromium with `naturalWidth` 100 (was 0).
**Not changed, with reasons:**
- F2 (external `href`/`@import` survive; script-only SVG stored blank): inert in `<img>` and under the `default-src 'none'; sandbox` CSP; a blank `<svg/>` is accepted on purpose (owner-settings.test.ts's file).
- F3 (multer's "Unexpected file field" text for a wrong field name) and F4 (malformed JSON answers 400 before the limit/404): the web never sends either; the plan's Phase 5 Issues already accepted F3.
- F5 (a 200 KB JSON body answers 500): pre-existing in B2's body parser, not B3's.
- F6 (duplicate `branchIds` stored as sent): matches the mock.
- Audit Finding 5 (privacy notice and subscription stay on MSW): Decision 1, stated in CHUNKS.
**Gate:** `pnpm run check` green (api 161); `clinic-branding.int.test.ts` 8/8.
**Final browser check (after the fix, on the same database):** `api-owner-settings.spec.ts` 7/7 twice in a row. Servers stopped, `tsconfig.json` reverted, temp config removed.
