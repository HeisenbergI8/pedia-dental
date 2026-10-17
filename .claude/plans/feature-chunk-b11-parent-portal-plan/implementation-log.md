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

## Phase 6: Identity: sign-in by mobile, parents' passwords, the reset limit — 2026-10-17

**Steps completed:** 6.1, 6.2
**Files changed:** `apps/api/src/auth/{rate-limit,rate-limit.test,auth.module,identity.service,auth.service}.ts`, `test/int/portal-sign-in.int.test.ts` (new), `test/int/jobs.int.test.ts`
**Deviations from plan:**
- `AuthModule` exports `RateLimitService` (and `AuthService`, for PortalService's `open`), not `RateLimitMiddleware`: a middleware is built by the module that applies it, so PortalModule only needs the service.
- The parent-login helpers (`createParentLogin`, `setParentPassword`, `removeParentLogin`, `phoneHolder`, `emailTaken`, `followPhone`) were written in Phase 7, where they are first used.
- `jobs.int.test.ts`: the counter sweep's longest window is now the reset hour, so its fixture rows moved to 60 and 59 minutes old.
**Gate:** `pnpm run check`: green. `portal-sign-in.int`: 4/4.

## Phase 7: The portal module and account texts — 2026-10-17

**Steps completed:** 7.1, 7.2, 7.3, 7.4
**Files changed:** `apps/api/src/message-queue/{account-links,account-links.test,message-queue.service,message-send.handler,message-queue.module}.ts`, `src/config/{env,env.test}.ts`, `.env.example`, `src/portal/{portal.service,portal-access.controller,password-links.controller,portal.module}.ts` (new), `src/patients/family.service.ts`, `src/auth/{identity.service,access-rules}.ts`, `src/app.module.ts`, `test/auth.test.ts`, `test/int/portal.int.test.ts` (new)
**Deviations from plan:**
- The sending-hours check moved inside the claim (it reads the row's kind there); an account text skips it. No other behaviour of the handler changed.
- PortalModule reads patients through `FamilyService` (new `guardianOn`, `familyOf`, `guardians`) instead of PatientsModule, so PatientsModule can import PortalModule in Phase 8 without a cycle.
- A number's holder (decision 14) is found through `Credential.phone` (active logins, indexed) plus the invited accounts' guardians, not by scanning every guardian.
- The 7.3 route test lives in `test/auth.test.ts` (the no-database app that already fakes the rate limiter), not a new file: the link routes' middleware needs that fake.
- Validation of the signed-out bodies is the controllers' `ZodValidationPipe`, so the service takes parsed input.
**Gate:** `pnpm run check`: green. `portal.int`: 10/10 (night send with reminders declined, link only in the provider call, single use under a race, resend and failed-send retry, parallel invites on one number, turn off signs out, reset 202/429, dentist and parent 403).

## Phase 8: Number changes and the ownership proof — 2026-10-17

**Steps completed:** 8.1, 8.2, 8.3
**Files changed:** `apps/api/src/patients/{patient-writes.service,patients.module}.ts`, `src/portal/portal.service.ts` (`numberChanged`), `src/auth/{record-owners,access-rules.test}.ts`, `test/int/{portal-guardians,parent-ownership}.int.test.ts` (new), `test/int/today.int.test.ts`
**Deviations from plan:**
- `update` and `quickUpdate` take the clinic's lock first (account before patient), so a number change is checked against other parents' numbers under the same lock as an invite (E8). Patient edits in one clinic now queue behind each other briefly.
- A number written another way (same `smsNumber`) is not a change: no sessions end.
- The ownership sweep skips `POST /patients/:id/exports`: the API has no controller for it yet (B13, Data Privacy Act operations), so Nest answers 404 before the guard.
- The seed's photos all belong to one family, so the sweep writes one other-family photo row.
- `today.int.test.ts`: its "not vacuous" check failed every Sunday (the seed's clinic is closed on Sundays, so today has no appointments); it now skips that one check on a Sunday. Pre-existing, found tonight.
**Gate:** `pnpm run check`: green. `pnpm --filter api test:int`: 45 files, 497 passed before the Sunday fix (the one failure was that check), then today.int 10/10.

## Phase 9: `hybrid`, the browser spec, the docs — 2026-10-17

**Steps completed:** 9.1, 9.2, 9.3
**Files changed:** `apps/web/src/mocks/{passthrough,passthrough.test}.ts`, `apps/web/e2e/api-portal.spec.ts` (new), `apps/web/src/features/auth/components/set-password-screen.tsx`, `CONVENTIONS.md`, `apps/api/{CONVENTIONS,CHUNKS}.md`
**Deviations from plan:**
- The browser spec found a real bug: in development React runs effects twice, and the set-password page cleared the token from the address on the first run, so the second run showed "This link isn't complete". The token is now read once into a ref.
- The spec has 4 steps (invite on the Overview; first sign-in with the notice and a 403 for another family's child from the API; sign-in by mobile, forgot password and reset by text; turn off signs the parent out).
**Gate:** `pnpm run check`: green. Browser against apps/api on a fresh database (`pedia_dental_e2e_b11`, `DEMO_LOGINS=true WEB_URL=http://localhost:3190`): `api-portal.spec.ts` 4/4 three times, with `api-patients.spec.ts` 5/5 twice.

## Steps not implemented

None skipped. Still open by decision: Semaphore account, credits and PRIMOLAR's approval (the user), `WEB_URL` in production (B13), pruning expired `PortalLink` rows (later).
