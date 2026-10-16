# Implementation log: Chunk B4, Patients and privacy consent

## Phase 1: Tables — 2026-10-16

**Steps completed:** 1.1, 1.2
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016132736_patients/migration.sql`, `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm --filter api typecheck` green; `vitest run src/prisma/tenant-scope.test.ts` 25/25
**Notes:** `migrate dev` ran without warnings, so the B3 `migrate diff` workaround wasn't needed.

## Phase 2: Shared search text and the serializer — 2026-10-16

**Steps completed:** 2.1, 2.2
**Files changed:** `packages/shared/src/domain/patient-list.ts`, `packages/shared/src/domain/patient-list.test.ts`, `apps/api/src/patients/patient.views.ts`, `apps/api/src/patients/patient.views.test.ts`
**Deviations from plan:** the views test builds its `PatientRecord` inline (the plan left the fixture unspecified) and checks `birthDate` against the exact day.
**Gate:** shared `patient-list.test.ts` 14/14; `src/patients` 5/5; web handler tests (search cases) green in the full check.
**Notes:** none.

## Phase 3: Seed — 2026-10-16

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/api/src/patients/patient.rows.ts`, `apps/api/src/patients/patient.rows.test.ts`, `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** the round-trip test covers every seeded Bulilit patient, not only `patients[0]`. The seed test checks the first patient only where a clinic has one: some seeded clinics have none (`db.patients[0]` was undefined).
**Gate:** `pnpm run check` green (shared 189, seed 19, api 167, web 342); `pnpm --filter api test:int` 18 files, 113 passed.
**Notes:** the local MySQL volume predated `pedia_dental_test` in `docker/mysql-init.sql`; created it with the init script's two statements. No repo change.

## Phase 4: Parents and their children — 2026-10-16

**Steps completed:** 4.1
**Files changed:** `apps/api/src/patients/family.service.ts`, `apps/api/src/patients/family.module.ts`, `apps/api/src/auth/identity.service.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/auth/access.guard.ts`, `apps/api/test/access-guard.test.ts`, `apps/api/test/int/access-guard.int.test.ts`, `apps/api/test/int/sessions.int.test.ts`
**Deviations from plan:** `sessions.int.test.ts` builds `IdentityService` by hand, so it now passes a `FamilyService` (the plan's Potential Issues predicted this). The int guard case checks every one of the parent's children reaches the stub, not just one.
**Gate:** `pnpm --filter api typecheck` green; `test/access-guard.test.ts` 7/7; `test:int` access-guard + sessions 14/14.
**Notes:** `viewerOf` was added in Phase 5 with the controller (it imports `ClinicIdentity` by type only).

## Phase 5: Reads — 2026-10-16

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `apps/api/src/logging/logger.ts`, `apps/api/test/logging.test.ts`, `apps/api/src/patients/patient-search.ts`, `apps/api/src/patients/patient-search.test.ts`, `packages/shared/src/domain/patient-list.ts` (`pageWindow`), `apps/api/src/patients/patient.views.ts` (`viewerOf`, `toSummary`), `apps/api/src/patients/patients.service.ts`, `apps/api/src/patients/patients.controller.ts`, `apps/api/src/patients/patients.module.ts`, `apps/api/src/app.module.ts`, `apps/api/test/patients-routes.test.ts`, `apps/api/test/int/patients-read.int.test.ts`
**Deviations from plan:** the log test drives `/api/probe/log?…` (the file's existing probe) instead of `/api/health?…`, which waits ~30 s for MySQL in a DB-free test. In the header-summary case, the dentist gets `balance`/`credit` too: dentists hold `billing.view` (permissions.ts), exactly as in the mock, so the test asserts siblings only for them.
**Gate:** `pnpm run check` green (api 179, web 342); `pnpm --filter api test:int` 19 files, 125 passed, 3 todo.
**Notes:** search parity proven on MySQL, including `_`/`%` literal and `jose` ≠ `josé`. `LIMIT/OFFSET` as bound parameters work with the mariadb adapter.

## Phase 6: Writes — 2026-10-16

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `apps/api/src/patients/patient.rows.ts`, `apps/api/src/patients/patient.rows.test.ts`, `apps/api/src/patients/patient-writes.service.ts`, `apps/api/src/legal/privacy-notice.service.ts`, `apps/api/src/legal/legal.module.ts`, `apps/api/src/patients/patients.controller.ts`, `apps/api/src/patients/patients.module.ts`, `apps/api/test/patients-routes.test.ts`, `apps/api/test/int/patients-write.int.test.ts`
**Deviations from plan:** `lockPatient` is exported (Phases 7 and 8 lock the same row). Added one case beyond the plan's list: PUT/PATCH/consents answer 404 before reading the body (the mock's order).
**Gate:** `pnpm run check` green (api 189, web 342); `pnpm --filter api test:int` 20 files, 143 passed, 3 todo.
**Notes:** the parallel-numbering case runs 3 rounds of 20 concurrent POSTs; every round got 20 consecutive numbers. The audit case asserts the exact sequence of entries for one patient.
