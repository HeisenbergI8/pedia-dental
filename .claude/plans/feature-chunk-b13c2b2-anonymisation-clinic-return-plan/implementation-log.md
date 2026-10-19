# B13c2b-2 implementation log

Open questions settled by the session's safe defaults (user rule: deleting parts ship off, confirm with counsel): Q1 bundled one-off release task (no infra change); Q2 anonymise only children with an approved erasure request.

## Phase 1: Contracts: retention periods as data — 2026-10-19

**Steps completed:** 1.1
**Files changed:** `packages/shared/src/domain/retention.ts` (new), `packages/shared/src/domain/retention.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check` exit 0 (shared 251 tests / 32 files, api 553 / 84, web 415 / 36, infra 41, seed 31). The api run prints an "Unhandled error" rxjs stack that does not fail the run (pre-existing log noise, unrelated to this phase).
**Notes:** `RECORD_RETENTION` ships `{ null, null }` (confirm with counsel).

## Phase 2: Schema and the switch — 2026-10-19

**Steps completed:** 2.1, 2.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261021000000_b13c2b2_anonymisation/migration.sql` (new), `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/.env.example`, `apps/api/src/patients/patient.views.test.ts`
**Deviations from plan:** `patient.views.test.ts`'s typed Patient row fixture gains `anonymisedAt: null` (tsc requires every column; one-word fixture fix, not in the plan's file list).
**Gate:** `pnpm run check` exit 0 (api 554 tests / 84 files, shared 251, web 415, infra 41, seed 31). Migration generated with `prisma migrate diff --from-config-datasource` against `pedia_dental_b13c2b2_test` (deployed to the previous migration first); content matches the plan exactly. `db:deploy` + `db:generate` run on that `_test` DB; `db:drift` reports no difference.
**Notes:** the local dev database (`.env`) was not touched; only the `_test` DB was migrated.

## Phase 3: Anonymisation — 2026-10-19

**Steps completed:** 3.1, 3.2, 3.3, 3.4
**Files changed:** `apps/api/src/privacy/{erasure.service.ts, erasure.test.ts, privacy.jobs.ts, privacy.jobs.test.ts, privacy.module.ts}` (new), `apps/api/src/appointments/appointment-records.service.ts`, `apps/api/src/app.module.ts`, `apps/api/src/privacy/retention-schedule.ts`, `apps/api/src/privacy/retention-schedule.test.ts`, `PRIVACY_OPERATIONS.md` (inventory only), `apps/api/test/int/erasure.int.test.ts` (new)
**Deviations from plan:**
- **Guardian phone → `"Anonymised"`, not `""`.** The plan's `phone: ""` made `GET /patients/:id` answer 500 for the Owner (int case 6 caught it): `toPatient` parses the shared `Patient`, whose `Guardian.phone` is `z.string().min(7)`. Loosening the shared contract would touch the web's forms and MSW, so the column takes the word instead (10 chars, not a number; a restricted child is never texted, B13c2b-1 `declineAll`). Commented in `ANONYMISE.PatientGuardian`; the int case asserts `phone === ANONYMISED`.
- The `Retention` doc comment in `retention-schedule.ts` (which the plan rewrites in Step 3.3) is left until Step 4.4, because SETUP and ClinicAccount still say `"B13c2b"` until then and the new wording would be wrong for one commit.
- Int test: the seed is called with `app.get(FileStorage)` (as `photos.int.test.ts` does) so the photo files exist and case 4 proves their deletion; the `StoredFile` count in case 4 runs inside the clinic context (a tenant model). Case 7 picks the second child as one with no upcoming appointment and a last activity before today (so `{0, 0}` periods have ended for it).
**Gate:** `pnpm run check` exit 0 (api 560 tests / 86 files, shared 251, web 415, infra 41, seed 31). `pnpm run check -- privacy-routes.test` exit 0 (8 tests: AppModule resolves `PrivacyModule`). `TEST_DATABASE_URL=…/pedia_dental_b13c2b2_test pnpm --filter api test:int test/int/erasure.int.test.ts`: 8/8 passed.
**Notes:** inventory regenerated with the plan's `node --import @swc-node/register/esm-register -e …` one-liner and pasted between the markers.
