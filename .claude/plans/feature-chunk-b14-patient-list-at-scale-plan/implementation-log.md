# B14 implementation log

Open questions settled (user: "fix it, merge only if the load test proves it"): Q1 store balance as a cache always recomputed from source rows, amend both CONVENTIONS rules; Q2 the unpaged full-directory screens go to Follow-ups / a later chunk; Q3 accept ranking within the 50 name matches; Q4 cap 50.

## Phase 1: Today without the whole patient table — 2026-10-19

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261022000000_b14_visit_date_index/migration.sql`, `apps/api/src/patients/patients.service.ts`, `apps/api/src/reports/reports.service.ts`, `apps/api/src/messages/messages.service.ts`, `apps/api/test/int/today.int.test.ts`
**Deviations from plan:**
- `basics()` had a second caller the plan's reference missed: `MessagesService.greetAll` (the daily birthday job). It now calls `basicsFor([], today)` (only today's birthday children, filtered again by `isBirthdayOn`), and `basics()` is deleted.
- Q4 settled by reading `isBirthdayOn` (`domain/messages.ts`: exact `MM-DD` match): a 29 February child never matches on 28 February, so the `leapDay` clause is dropped.
**Gate:** migration SQL from `prisma migrate diff --from-config-datasource` on `pedia_dental_b14_test`; `db:deploy`, `db:generate`, `db:drift` = no difference. `test:int today + messages`: 2 files, 24 passed. `pnpm run check` exit 0 (api 563 / 87 files, shared 251, web 415, infra 41, seed 31).
**Notes:** the new int case's oracle is the shared `todaySummary` over a full read of patients, completed visits, done appointments and birthday messages.
