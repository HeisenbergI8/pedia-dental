# Implementation log: Chunk B7, Scheduling, follow-ups and Today

Plan: `feature-chunk-b7-scheduling-today-plan.md`. One entry per phase, in B6's shape. Record deviations from the plan
as they happen, with the reason; "none" when there are none.

## Decisions confirmed by the user — 2026-10-16

Asked before building: keep the demo's double-booking rule (chair and dentist, not the same child) (1); parents may
confirm their own child's appointment now (2); booking texts and birthday-greeting ticks wait for B9 (3, 4); no
privacy-log entry for whole-day screens, as the patient list (6). Decision 5 (same-time bookings in chair order) as the
plan recommends. Engineering decisions E1–E8 as the plan records them.

<!-- Template for each phase:
## Phase N: <name> — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:**
-->

## Phase 1: Clinic time and tables — 2026-10-16

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `apps/api/src/clinic-time.ts` + test (new), `apps/api/src/main.ts`, `apps/api/prisma/seed.ts`, `apps/api/vitest.config.ts`, `apps/api/vitest.int.config.ts`, `apps/api/package.json` + `pnpm-lock.yaml` (date-fns, the version the workspace already uses), `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261016173110_scheduling/migration.sql`, `apps/api/src/prisma/{model-scope,tenant-scope.test}.ts`, `apps/api/test/int/growth.int.test.ts`
**Deviations from plan:**
- `date-fns` added to the API's dependencies: `clinic-time.test.ts` imports it, and pnpm doesn't hoist it.
- Pinning Manila time exposed a test assumption in B6's `growth.int.test.ts`. Its `day()` sliced the UTC date, while `habitTimeline` takes the local day. `day()` now formats the local day, as `habitTimeline` does.
**Gate:** `pnpm run check` green (api 252); `test:int` 27 files, 229 passed + 5 todo. Migration: 3 tables, 9 index lines (incl. the unique), nothing touching earlier tables.

## Phase 2: Shapes and rules — 2026-10-16

**Steps completed:** 2.1–2.4
**Files changed:** `apps/api/src/appointments/{appointment.rows,request.rows,appointment.rules}.ts` + tests, `apps/api/src/recalls/{due-item.rows,due-item.rules}.ts` + tests (all new), `apps/api/src/common/refusal.ts` (403 allowed)
**Deviations from plan:** the status 409 case uses done → confirmed: `ChangeAppointmentStatusInput` can't carry "done", so the plan's booked → done isn't a sendable input. `dueBackfill` rebuilds exactly the seed's due items (proved in its test).
**Gate:** `pnpm run check` green.

## Phase 3: Seed — 2026-10-16

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `packages/seed/src/seed.ts` (requests a minute apart), `packages/seed/src/seed.test.ts` (3 ordering cases), `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Deviations from plan:** none. The chair-order case holds for the seed, so decision 5 changes nothing for the demo clinics.
**Gate:** `pnpm run check` green (seed 22, api 273); `test:int` 27 files, 230 passed + 5 todo. B7a closes here.

## Phase 4: Appointments — 2026-10-16

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `apps/api/src/appointments/{appointment-records.service,appointment-records.module,appointments.service,appointments.controller,appointments.module}.ts` (new), `apps/api/src/clinic/{clinic.service,branches.service}.ts` (`scheduleRefs`; `BRANCH_COLUMNS` exported), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/appointments.int.test.ts` (new)
**Deviations from plan:**
- `scheduleRefs` reads its three tables one after another (one connection anyway) and parses `alsoRoles`/`branchIds` as `toStaffMember` does (the plan's QUESTION).
- Int test: Dasmariñas cases sign in as the Owner (the admin works at Imus only, so its `pd_branch=branch_dasma` falls back to Imus). The archived-branch refusal isn't reachable over HTTP (`branchFor` never yields an archived branch), so it stays a unit case. "Can't move" uses an arrived appointment: `done` is only reachable through a visit (Phase 6).
- Mutation check: with `lockAccount` removed from book and move, 17 of the 18 race cases go red.
**Gate:** `pnpm run check` green; `appointments.int.test.ts` 29/29.

## Phase 5: Requests and parent confirm — 2026-10-16

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/api/src/auth/{record-owners,access-rules,access.guard,auth.module}.ts`, `apps/api/src/appointments/{appointment-requests.service,appointments.service,appointments.controller,appointments.module}.ts`, `apps/api/src/patients/patients.service.ts` (`primaryGuardianId`), `apps/api/test/{access-guard,clinical-routes}.test.ts`, `apps/api/test/int/appointment-requests.int.test.ts` (new)
**Deviations from plan:**
- The guard test overrides `RecordOwners` with a fake: the real app already registers the appointment route, and a second `register` throws.
- The `guardianId` QUESTION: `Credential.guardianId` holds the bare guardian id (schema.prisma:160), so the session's value is used as is.
- Case 2's 404 and case 3's "staff ask on a parent's behalf" aren't reachable over HTTP: only parents hold `appointments.request` (PARENT_ONLY), and the guard refuses them a child that isn't theirs. The int test asserts those 403s and checks `primaryGuardianId` directly. `RegisterPatientInput` needs exactly one primary, so "else the first" covers only legacy data.
- Mutation check: with `lockPatient` removed from `create`, the 10-request race goes red.
**Gate:** `pnpm run check` green (api 285); `test:int` 29 files, 267 passed + 5 todo.

## Phase 6: Due items, signing, visits, backfill — 2026-10-16

**Steps completed:** 6.1, 6.2, 6.3, 6.4, 6.5
**Files changed:** `apps/api/src/recalls/{due-items.service,recalls.controller,recalls.module}.ts` (new), `apps/api/src/visits/{visits.service,visits.module}.ts` (appointment check/seat/done; `dentistsOf`, `datesOf`), `apps/api/src/notes/{notes.service,notes.module}.ts` (`afterSign` in sign; `signedForBackfill`), `apps/api/src/appointments/{appointments.service,appointments.module}.ts` (`takeFor` in book), `apps/api/src/app.module.ts`, `apps/api/prisma/backfill-due-items.ts` (new), `apps/api/package.json`, `apps/api/tsconfig.json` (typechecks the script), `apps/api/prisma/schema.prisma` (Visit.appointmentId comment only: empty diff), `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/{recalls,visits}.int.test.ts`
**Deviations from plan:**
- `DueItemsService` takes no `Clock`: signing passes its `signedAt`, and nothing else needs the time.
- The backfill script's request context is `{ requestId, clinicId, operator: false }`, as `seed-database.ts` (the plan's QUESTION).
- Case 7 (sign vs book race) asserts both succeed, one closed item and one open, and the booking took exactly one item. Mutation: removing `lockPatient` from `book` leaves it green. Any interleaving matches one of the two serial orders, because signing closes the old item either way. So the lock isn't what keeps this pair consistent, and the test checks for no 500 and no lost write.
- Case 16 (start vs cancel) runs 20 rounds: with `setStatus`'s `lockPatient` removed it fails (round 3 of 30), and 6 rounds passed by chance.
- Smoke: `db:backfill-due-items` on a freshly seeded scratch database with every DueItem deleted: clinic_demo 54 opened (the seed's 54), then 0 on a second run.
**Gate:** `pnpm run check` exit 0; `test:int` 30 files, 283 passed + 5 todo.

## Phase 7: Patient list, header, branch archiving — 2026-10-16

**Steps completed:** 7.1, 7.2, 7.3, 7.4
**Files changed:** `apps/api/src/visits/{visit-days.service,visit-days.module}.ts`, `apps/api/src/patients/{patient-standing,patient-standing.test}.ts` (new), `apps/api/src/patients/{patients.service,patient.views,patient.views.test,patients.module,patient-lock}.ts`, `apps/api/src/clinic/{branches.service,clinic.module}.ts`, `apps/api/test/int/{patients-read,owner-settings,visits}.int.test.ts`
**Deviations from plan:**
- `Map.groupBy` replaced by a loop: the API's TS lib is ES2023 (the plan's QUESTION).
- `PATIENT_NOT_FOUND` moved from `patients.service.ts` to `patient-lock.ts`. With `PatientsService → DueItemsService → VisitsService → patient-lock`, the old import made a file cycle, and Nest couldn't resolve `DueItemsService`'s `VisitsService`.
- `matching` lost its paging option and `count()` was deleted: `summaries` no longer uses them (lean-code). `records` keeps the ids' order (the plan's QUESTION: it does).
- `archive` already takes `lockAccount` before `upcomingAt` (the plan's QUESTION), so archiving and booking serialise.
- Int test: the B4 "nothing under the filters" case became parity with the mock's `patientStanding` over the seed, row by row, plus each chip's total. `sort=balance` without `billing.view` stays a unit case: every staff role and the parent hold `billing.view`. The archive case reopens Dasmariñas after archiving it, so the downgrade case still counts 3 open branches.
- The visits case "seats … marks it done" now expects the header's `lastVisitOn` to be the done appointment's day (2030), the mock's rule, not the fixed clock's.
**Gate:** `pnpm run check` exit 0; `test:int` 30 files, 286 passed + 3 todo (B8, B9).

## Phase 8: Today — 2026-10-16

**Steps completed:** 8.1, 8.2, 8.3
**Files changed:** `apps/api/src/reports/{report-branches,report-branches.test,reports.service,reports.controller,reports.module}.ts` (new), `apps/api/src/clinic/clinic.service.ts` (`staffNames`, `tier`, `scheduleRefs` defaults its tx; a misplaced Phase 4 doc comment moved back to `isActiveDentist`), `apps/api/src/visits/visit-days.service.ts` (`visitorsBetween`), `apps/api/src/patients/patients.service.ts` (`basics`), `apps/api/src/appointments/{appointment-requests.service,appointments.module}.ts` (`pending`, exported), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`, `apps/api/test/int/today.int.test.ts` (new)
**Deviations from plan:**
- The tier comes from `ClinicService.tier()`: `ClinicIdentity` carries no account (the plan's QUESTION). Usable branches are `who.branches`.
- `ReportsService` doesn't take Prisma: `scheduleRefs(tx = this.prisma)`.
- Ngiti's two seeded appointments are on the next open day, not today, so its case checks parity today and on that day.
- Case 8: the child's first visit day is today (the visit is dated by the real clock), so on the 2030 day they count as returning, not new.
- Expected values use `messages: []` (decision 4: no greetings until B9).
- Mutation: without the dedupe by id, "every day of this week" and the live booking case go red.
**Gate:** `pnpm run check` exit 0; `test:int` 31 files, 295 passed + 3 todo.
