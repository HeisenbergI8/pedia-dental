# Implementation log: B13c2b-1 (privacy request register and restriction on erasure)

Branch `feature/b13c2b1-privacy-requests`, from master `5432ad1` (B13c2a merged). Scope: Phases 1–6; section 5
(B13c2b-2) is out of scope. The repo matched the plan's starting state (planned at `acc4439`, now merged).

## Phase 1: Contracts — 2026-10-19

**Steps completed:** 1.1, 1.2
**Files changed:** `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/privacy-requests.ts` (new),
`packages/shared/src/schemas/patient.ts`, `packages/shared/src/index.ts`, `packages/shared/src/domain/privacy-requests.ts`
(new), `packages/shared/src/domain/privacy-requests.test.ts` (new)
**Deviations from plan:** none
**Gate:** `pnpm run typecheck` green; `vitest run src/domain/privacy-requests.test.ts` 4/4; `pnpm run check` exit 0
(shared 246, seed 31, infra 41, web 407, api 546 tests).
**Notes:** `PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT = 15` is the counsel placeholder (C4).
- Process note: the Phase 1 commit (`865be58`) has its body run into the subject line (no blank line after the
  subject). Left as is: no history rewrites on this branch.

## Phase 2: API: the register — 2026-10-19

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5
**Files changed:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261020000000_b13c2b_privacy_requests/migration.sql`
(new, from `prisma migrate diff --from-config-datasource`), `apps/api/src/prisma/model-scope.ts`,
`apps/api/src/privacy/retention-schedule.ts`, `PRIVACY_OPERATIONS.md` (inventory regenerated: one `PrivacyRequest` row),
`apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/.env.example`,
`apps/api/src/privacy-requests/{privacy-requests.service,privacy-requests.controller,privacy-requests.module}.ts` (new),
`apps/api/src/app.module.ts`, `apps/api/src/auth/access-rules.ts`, `apps/web/src/mocks/access.ts`,
`apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`, `apps/api/test/privacy-routes.test.ts`,
`apps/api/src/patients/patient.views.test.ts`, `apps/api/test/int/privacy-requests.int.test.ts` (new)
**Deviations from plan:**
- The migration SQL is exactly the plan's expectation (one `ALTER TABLE Patient ADD restrictedAt`, one
  `Patient_clinicId_restrictedAt_idx`, one `CREATE TABLE PrivacyRequest` with two indexes). Applied with `db:deploy`,
  client regenerated with `db:generate`. The inventory was printed by a throwaway script in the scratchpad, not a test.
- `patient.views.test.ts`'s hand-built row gets `restrictedAt: null` now (planned in 3.3): the regenerated client makes
  tsc fail without it.
- `passthrough.test.ts` counts `API_ROUTES` exactly; it gains `B13C2B_ROUTES = 3` and a check that the three routes are
  served (the plan didn't list this file; it failed without it).
- Int case "lists open requests soonest due first, with the child's name" also asserts the child's name (its title
  claims it; the plan's body didn't check it).
**Gate:** `pnpm run check` exit 0 (shared 246, seed 31, infra 41, web 407, api 550);
`pnpm --filter api test:int test/int/privacy-requests.int.test.ts` 4/4 on MySQL 127.0.0.1:3307 (the `_test` database).
**Notes:** between Phase 2 and Phase 3 an erasure closed as done is not yet restricted (branch-internal, planned).

## Phase 3: API: restriction on an approved erasure — 2026-10-19

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5
**Files changed:** `apps/api/src/auth/patient-restrictions.ts` (new), `apps/api/src/auth/auth.module.ts`,
`apps/api/src/auth/access.guard.ts`, `apps/api/test/access-guard.test.ts`, `apps/api/src/visits/{visits.service,visits.module}.ts`,
`apps/api/src/notes/{notes.service,notes.module}.ts`, `apps/api/src/plan/{plan.service,plan.module}.ts`,
`apps/api/src/appointments/{appointments.service,appointment-requests.service,appointment-records.service}.ts`,
`apps/api/src/billing/{invoices.service,billing.module}.ts`, `apps/api/src/patients/{patients.service,patients.module,patient.views,patient.views.test,family.service,patient-writes.service}.ts`,
`apps/api/src/privacy-requests/{privacy-requests.service,privacy-requests.module}.ts`,
`apps/api/test/int/parent-ownership.int.test.ts`, `apps/api/test/int/privacy-requests.int.test.ts`
**Deviations from plan:**
- Step 3.1: `access-guard.test.ts` needed the `AuditService` override (the plan's open question: its Prisma stub has
  no `auditEvent`). The override records the calls, so the restricted case also asserts the one `denied` write.
- Step 3.2: invoices use the existing `BillingRecordsService.patientOfInvoice` (the plan named a new
  `invoicePatientOf`; it already exists under that name). `NotesService` gains a private non-throwing `ownerOf`, and
  `patientOf` keeps its 404 on top of it. `BillingModule` and `NotesModule` import `AuthModule` too (the plan named only
  Visits and Plan; both registering services need `RecordOwners`). No DI cycle (`pnpm run check` builds `AppModule`).
- Step 3.5: `lone` is picked from the seed with a guardian whose portal account is `active`, and the case first asserts
  that parent's `/auth/me` is 200, then 401 after the restriction on the **same** session cookie. Without an active
  portal login the 401 would hold before the restriction too (no credential), so the plan's case would be vacuous.
  The upcoming filter uses all four `UPCOMING` statuses (booked, confirmed, arrived, in_chair), as the service does.
- `/auth/me` for a parent with no unrestricted child answers 401 (`auth.controller.ts` `me`: no identity), as expected.
**Gate:** `pnpm run check` exit 0 (api 553, web 407, shared 246, seed 31, infra 41);
`pnpm --filter api test:int test/int/privacy-requests.int.test.ts test/int/parent-ownership.int.test.ts` 27/27;
the whole `pnpm --filter api test:int` 56 files / 628 tests passed.
**Notes:**
- The guard writes `denied` "Patient record (restricted)" only for this refusal (the API logs no other gate refusal).
- Gap, outside the plan (Q3-adjacent): routes that carry a child only in the **body** (e.g. `POST /appointments`,
  `POST /privacy-requests` itself) aren't checked by the guard. A restricted child is hidden from every picker, so the
  web can't reach it, but the API would accept a hand-made booking for a restricted id. Left for the auditor/user.

## Phase 4: MSW: the handlers, the gate and the web's cases — 2026-10-19

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `packages/seed/src/{platform,logins,seed,seed-ipin,seed-ngiti}.ts`, `apps/web/src/mocks/db.ts` (key
`pedia-dental:mock-db:v32`), `apps/web/src/features/privacy-requests/mocks.ts` (new), `apps/web/src/mocks/handlers.ts`,
`apps/web/src/mocks/access.ts`, `apps/web/src/features/patients/mocks.ts`, `apps/web/src/features/dashboard/mocks.ts`,
`apps/web/src/mocks/privacy.test.ts`
**Deviations from plan:**
- Withdrawal of queued texts: the mock has no helper; the reminders "no" path does it inline, setting `"cancelled"`
  (not the plan sketch's `"withdrawn"`, which isn't the mock's status). `restrict` does the same, inline.
- The mock's `restrict` also writes the API's two audit rows ("Privacy consent (changed)", "Patient record
  (restricted)", both `update`), which the plan sketch left out.
- Today's birthdays in MSW come from `todaySummary(branchView(db, …))` in `features/dashboard/mocks.ts` (there is no
  `features/reports/mocks.ts`): the Today handler passes `patients` without restricted children, as the API's
  `basics()`.
- `/auth/me` parity (plan's open question for case 7): the mock answered 200 for a parent whose only child is
  restricted, because `allAccounts` listed every guardian on any patient. Instead of a ledger line, `allAccounts`
  (`packages/seed/src/logins.ts`) now builds its guardians from unrestricted children only, matching the API (sign-in
  skips such a parent, the open session ends). So all seven web cases are twins with identical titles; no ledger line.
- The mock gate's existing audit line reuses the `patientId` it now computes (same value as before).
**Gate:** `pnpm run check` exit 0 (web 414, api 553, shared 246, seed 31, infra 41);
`pnpm --filter web exec vitest run src/mocks/privacy.test.ts` 24/24; `port-ledger` 16/16.

## Phase 5: Web screens — 2026-10-19

**Steps completed:** 5.1, 5.2, 5.3 (`ui-ux-design` loaded with `interaction-patterns.md` and `accessibility.md`)
**Files changed:** `apps/web/src/features/privacy-requests/api.ts` (new),
`apps/web/src/features/privacy-requests/components/{privacy-requests,request-dialogs}.tsx` (new),
`apps/web/src/features/clinic/components/settings-screen.tsx`, `apps/web/src/features/patients/components/patient-header.tsx`,
`apps/web/src/features/portal/components/portal-privacy.tsx`
**Deviations from plan:**
- `useClosedPrivacyRequests` takes no `enabled` flag: the closed list mounts only when "Closed" is chosen, so the
  query starts with it. `useLogPrivacyRequest` also refreshes the audit log (the log entry is new).
- The open list's row action sits in `DataList`'s `actions` slot (table's last column; a card's foot on phones);
  the access request's copy button is labelled "Copy of records".
- Close dialog: the outcome is a two-chip radio group (`ChoiceChips`, Radix RadioGroup) labelled "Approve / Decline" for
  an erasure and "Done / Decline" otherwise, mapped to `done` / `declined`. The erasure warning panel uses the
  danger tokens (the action is the destructive one); the 409 refusal shows inline in the warning tokens with
  `role="alert"` and a link to the child's record (Overview: the record has no Appointments tab).
- Restricted banner: warning tokens, `role="status"`, under the alerts row, date via `formatDate` (local day).
**Gate:** `pnpm run check` exit 0 (web 414, api 553, shared 246, seed 31, infra 41); `pnpm run check -- design` 100/100.
**Visual check** (MSW, `NEXT_PUBLIC_API_MOCKING=enabled`, `next dev` on its own `NEXT_DIST_DIR=.next-shots`,
Playwright/Chromium screenshots; `apps/web/tsconfig.json` reverted afterwards):
- Looked at: Settings → Privacy at 1440, 1280, 768 and 375 with three open requests (one received four weeks back
  shows "Overdue" with the clock icon in danger), the Closed list, the Log dialog (empty submit shows the erasure
  child message and "Enter who asked" inline), the close dialog for an erasure (typed first name: the
  "Restrict {name}'s record" button is disabled with a wrong name and enabled with the right one), a refused
  approval (child with an upcoming appointment: the server's words inline, form kept), the close dialog at 375, and
  a restricted record as the Owner (banner under the allergy chip, identity and alerts unchanged).
- Keyboard: in the close dialog, Tab cycles outcome radios → outcome text → (confirm input) → Keep it open → the
  primary → the dialog's Close; Esc closes.
- Fixed while looking: the Open/Closed control stretched across the card; now `w-max`, as the audit log's.
- Left: the Due column has no "Due soon" example in the walkthrough (unit-tested in `requestStanding`); dark mode
  and 200% zoom were not looked at (tokens only, the design guards pass).
- Not verified: screen reader announcement of the inline refusal (`role="alert"`).

## Phase 6: Documentation — 2026-10-19

**Steps completed:** 6.1, 6.2
**Files changed:** `PRIVACY_OPERATIONS.md` (Requests), `CONVENTIONS.md` (Domain rules, Where things live, the mock key
v32), `apps/api/CONVENTIONS.md` (current phase, Where things live: `src/privacy-requests/`, `patient-restrictions.ts`
and the `RecordOwners` line, two traps, Decisions recorded), `apps/api/CHUNKS.md` (B13c2b-1 done, B13c2b-2 next)
**Deviations from plan:** the restricted-list trap in `apps/api/CONVENTIONS.md` also names the known gaps (clinic-wide
logs, Q3; body-only child routes such as `POST /appointments`, found in Phase 3). The `RecordOwners` row in
"Where things live" said "the guard asks for parents only", which B13c2b changed; updated.
**Gate:** `pnpm run check` exit 0 (shared 246, seed 31, infra 41, web 414, api 553), which includes `inventory.test.ts`.

## Not implemented / for the tester and auditor

- Section 5 (B13c2b-2) is out of scope, as asked.
- Q1–Q8 stay at their defaults (no self-serve request, no lift, clinic-wide logs unfiltered, no request–copy link,
  the Owner's tab only, holidays not skipped, 15 working days, siblings keep their portal).
- Not looked at: dark mode, 200% zoom, a screen reader pass on the new dialogs.


## Review fixes (after tester/auditor)

- **Auditor High:** the Recalls due list's Book reached `POST /appointments` for a restricted child (body-only route, outside the guard). Fixed: `AppointmentsService.book` and the MSW handler refuse a restricted child with 409 `RESTRICTED_BOOKING_MESSAGE` (shared), for every role (E7: no new appointment); `DueItemsService.list` and the MSW due list leave restricted children out (`RecallsModule` imports `AuthModule` for `PatientRestrictions`). Twin case "won't book a restricted child, and leaves them off the due list" in both files; the API case fails with the due-list filter and booking check removed, passes with them.
- **Auditor Low:** `PRIVACY_OPERATIONS.md` intro no longer says erasure requests aren't built; docs (root and API CONVENTIONS, PRIVACY_OPERATIONS) state the booking refusal and due-list filter. The stray `next dev -p 3123` (PID 10764) was stopped.
