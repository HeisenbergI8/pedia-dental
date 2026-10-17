# Implementation log: B11 parent portal

## Phase 1: The shared contract — 2026-10-17

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/domain/portal.ts` (+test), `schemas/portal.ts`, `schemas/auth.ts` (+test), `schemas/message.ts`, `domain/permissions.ts` (+test), `domain/patient-list.ts` (+test), `domain/messages.ts`, `index.ts`; `apps/web/src/features/messages/api.ts`; `apps/web/e2e/{owner,access-control}.spec.ts` (new refine words); `apps/api/src/message-queue/message.rows.ts`
**Deviations from plan:**
- The reset text puts the link last ("... Didn't ask? Ignore this text. [link]"), as the plan's own rule says; the test checks both texts end with the link.
- `MessageEvent.kind` stays `MessageKind` (a parent message is always a template kind), so `queue` keeps reading templates by kind.
- `CARE_KINDS` is typed `LoggedMessageKind[]` (the portal filters log rows with it).
- `messageData` casts `kind` to Prisma's enum until Phase 5 widens the column.
**Gate:** `pnpm run check`: green.

## Phase 2: Seeded portal accounts — 2026-10-17

**Steps completed:** 2.1
**Files changed:** `packages/seed/src/{logins,platform,seed,seed-ngiti,seed-ipin,seed.test}.ts`, `apps/web/src/mocks/{db,demo-accounts}.ts`, `apps/web/src/features/auth/mocks.ts` (rename only), `apps/api/test/int/seed.int.test.ts` (rename only), `apps/web/src/mocks/{privacy,tenancy}.test.ts`
**Deviations from plan:** two existing mock tests signed in as the guardian of a child they had just registered; since B11 that guardian is no login until invited, so each test now opens that guardian's portal account first (as an accepted invite would).
**Gate:** `pnpm run check`: green.

## Phase 3: The mock (the spec) — 2026-10-17

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `apps/web/src/features/portal/mocks.ts` (new), `apps/web/src/features/auth/mocks.ts`, `apps/web/src/features/patients/mocks.ts`, `apps/web/src/mocks/{access,handlers,handlers.test,portal.test}.ts`, `apps/web/e2e/*.spec.ts` (new 401 words), `apps/api/src/auth/access-rules.ts`
**Deviations from plan:**
- One test file (`mocks/portal.test.ts`) holds both the staff and the signed-out cases (the plan's two files shared every helper and ran in order).
- The ownership sweep found `GET /appointments` (the whole calendar) held by parents at `own` with no owner: it is refused outright for a parent, so the sweep now proves ownerless parent routes answer 403 "You don't have access to this" instead of asserting there are none.
- A resend withdraws every waiting account text to that guardian (not only invites): the only other kind is a reset, which can't be waiting while the account is only invited.
- The three staff rules were added to the API's `CLINIC_RULES` now (planned in 7.2): the drift test compares the two maps.
- New-family test checks the not-invited guardian's whole status (`toEqual`), since `toMatchObject` treats `blocked: undefined` as a required key.
**Gate:** `pnpm run check`: green.

## Phase 4: Screens — 2026-10-17

**Steps completed:** 4.1, 4.2, 4.3, 4.4
**Files changed:** `apps/web/src/features/portal/{api.ts,components/portal-password.tsx}`, `features/patients/components/{guardian-portal.tsx,patient-overview.tsx}`, `features/auth/components/{password-field,set-password-screen,forgot-password-screen,login-screen,account-menu}.tsx`, `app/{set-password,forgot-password,(portal)/portal/account}/page.tsx`, `apps/web/e2e/*` (sign-in label and messages)
**Deviations from plan:**
- `usePortalAction` is one mutation for invite and turn off (both POST to `portal-<action>`) instead of two hooks.
- `PasswordField` (show/hide password) is shared by sign-in, set-password and the portal's change password; the login screen's own copy was replaced by it.
- The account menu shows "Change password" when the session has a `guardianId` (a parent's login), not by checking the role.
- The turn-off dialog names the guardian, not a pronoun ("... will be signed out and won't see Bea's records until you invite them again").
- Existing browser specs were updated for the sign-in box's new label ("Mobile number or email") and messages; the operator's console sign-in is unchanged.
**Gate:** `pnpm run check`: green. Browser (demo build): access-control, admin, frontdesk, dentist, parent.mobile: 260 passed, 10 failed in uploads, chart history and certificates (screens B11 doesn't touch); checked against master below.

**Phase 4 browser follow-up:** the same 10 browser tests fail on master's demo build (built in a separate worktree, port 3151): all 10 failed there too. They predate B11 (the parent page shows B10's seeded photos instead of "Nothing uploaded yet"; chart and certificate cases depend on seeded dates). Not fixed in B11.

## Phase 5: Tables, migration and the API seed — 2026-10-17

**Steps completed:** 5.1, 5.2
**Files changed:** `apps/api/prisma/schema.prisma`, `prisma/migrations/20261017160000_b11_portal_accounts/migration.sql`, `src/prisma/{model-scope,tenant-scope.test}.ts`, `src/message-queue/message.rows.ts` (cast removed), `src/auth/identity.service.ts` (`email ?? ""`), `src/seed/seed-database.ts`, `test/int/{seed,message-queue,appointments}.int.test.ts`
**Deviations from plan:**
- `Credential` also gets `@@index([phone])` (sign-in looks a mobile up across clinics before one is chosen, as `@@index([email])`).
- `prisma format` realigned three lines of `NoteTemplate` (whitespace only).
- `appointments.int.test.ts` "withdraws the old reminder on a move": a pre-existing night-time flake (outside sending hours both confirmations go at the same 8 AM, so their order ties). It failed 1 run in 3 at 23:55 Manila; the assertion now compares the statuses sorted.
**Gate:** `pnpm run check`: green. `pnpm --filter api test:int`: 41 files, 463 passed + the flake above (fixed, then 4/4 green).
