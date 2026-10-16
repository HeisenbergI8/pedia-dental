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
