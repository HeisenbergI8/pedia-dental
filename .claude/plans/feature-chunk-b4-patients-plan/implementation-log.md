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
