# Implementation log: Primolar tenancy foundation (ROADMAP chunk 19)

Branch: `primolar-tenancy`.

## Phase 1: Shared tenancy contract — 2026-10-12

**Steps completed:** 1.1, 1.2, 1.3, 1.4
**Files changed:** `packages/shared/src/schemas/common.ts`, `packages/shared/src/schemas/tenancy.ts` (new), `packages/shared/src/domain/tenancy.ts` (new), `packages/shared/src/domain/tenancy.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** `AccountStatus` doc comment says staff are refused and parents keep read-only access (amended #26, #44), not "nobody signs in, parents included".
**Gate:** `pnpm run typecheck` green; `vitest run src/domain/tenancy.test.ts` 4/4.
**Notes:** nothing consumes the schemas yet.

## Phase 2: Partitioned mock store and seed migration — 2026-10-12

**Steps completed:** 2.1–2.9
**Files changed:** `apps/web/src/mocks/{seed-ngiti.ts (new),seed.ts,db.ts,demo-accounts.ts,access.ts,outbox.ts,handlers.test.ts}`, `apps/web/src/features/{patients,appointments,visits,plan,chart,growth,notes,documents,photos,billing}/mocks.ts`, `apps/web/src/features/auth/mocks.ts`, `apps/web/src/stores/session-store.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (shared 138, web 228).
**Notes:** `CLINIC_ID` is no longer exported; every stamp uses `currentClinicId()`. Login still takes the first account matching an email until Phase 7.

## Phase 3: Branch ids on branch-level records — 2026-10-12

**Steps completed:** 3.1–3.7
**Files changed:** `packages/shared/src/schemas/{appointment,clinic,billing}.ts`, test fixtures in `packages/shared/src/domain/{finance,money,patient-list,today}.test.ts` and `apps/web/src/features/documents/content.test.ts`, `apps/web/src/mocks/{seed,seed-ngiti,access}.ts`, `apps/web/src/features/{appointments,clinic,billing,dashboard}/mocks.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (shared 138, web 228).
**Notes:** `GET /clinic` added with its RULES entry. Dasmariñas has chairs 4–5 and future 12:00 bookings for Dr. Reyes; no billing.

## Phase 4: Clinic name and opening hours from data — 2026-10-12

**Steps completed:** 4.1–4.6
**Files changed:** `packages/shared/src/domain/{appointments,appointments.test,messages,messages.test}.ts`, `apps/web/src/mocks/{message-templates,outbox,seed,handlers.test}.ts`, `apps/web/src/features/appointments/{mocks.ts,components/appointment-calendar.tsx,components/appointment-form.tsx,components/agenda-list.tsx,components/month-count-grid.tsx,components/appointment-requests.tsx}`, `apps/web/src/features/recalls/components/recall-list.tsx`, `apps/web/src/features/clinic/api.ts`, `apps/web/src/features/messages/components/template-editor.tsx`, `apps/web/src/features/documents/{content.ts,content.test.ts,api.ts,components/document-pdf.tsx}`
**Deviations from plan:** `DocContent.clinicName` is set once in the `doc()` helper in `content.ts` instead of on every return (every document is built through `doc()`).
**Gate:** `pnpm run check` green (shared 140, web 228). eslint on changed files: one expected warning (`_session` unused until Step 6.5).
**Notes:** `CLINIC_NAME`, `CLINIC_HOURS` and `CLOSED_WEEKDAYS` are gone. Manual check still owed: the booking form's hours message at Dasmariñas 17:30 (RHF resolver swap).

## Phase 5: Isolation tests — 2026-10-12

**Steps completed:** 5.1, 5.2
**Files changed:** `apps/web/src/mocks/seed.test.ts`, `apps/web/src/mocks/tenancy.test.ts` (new)
**Deviations from plan:** two test assertions corrected, both plan assumptions about the data, not the code:
- "writes each account's audit trail": the plan checked `auditEvents.at(-1)`, but `recordAudit` drops a repeat view inside its window, so the last row was another actor's. Now asserts the Ngiti actor's row is in Ngiti's trail and no Ngiti actor or foreign clinicId is in the demo trail (stronger).
- "books at the active branch": 10:00 on day +8 collided with Dr. Reyes's seeded Imus booking (409). Moved to 12:00, which the seed never fills that day.
**Gate:** `pnpm run check` green.
**Notes:** chunk 19 "done when" part 1 (no cross-account reads or writes) is covered by `tenancy.test.ts`.

## Phase 6: Owner role and branch assignment — 2026-10-12

**Steps completed:** 6.1–6.6
**Files changed:** `packages/shared/src/schemas/{common,auth,clinic}.ts`, `packages/shared/src/domain/{permissions,permissions.test,tenancy,tenancy.test}.ts`, `apps/web/src/mocks/{seed,seed-ngiti,demo-accounts,access,handlers.test}.ts`, `apps/web/src/features/auth/{mocks.ts,access.tsx,components/login-screen.tsx}`, `apps/web/src/features/{appointments,visits,documents,photos,patients}/mocks.ts`, `apps/web/src/features/documents/{content.ts,content.test.ts,components/document-options.tsx,components/documents-tab.tsx}`, `apps/web/src/features/{recalls/components/recall-list,appointments/components/appointment-form,visits/components/visit-banner}.tsx`
**Deviations from plan:**
- The re-grep the plan asked for found five single-role checks it didn't list. All now use the roles union: `patients/mocks.ts` (3: phone search, contacts, money), `photos/mocks.ts` (clinical.write for parent uploads), `documents/content.ts` (issuer's patients.contact, via `rolesCan(rolesOf(issuer), …)`).
- `documents-tab.tsx`: `me` is a StaffMember, not a session, so the dentist check is `holdsRole(me, "dentist")`, not `me.roles.includes`.
- "lists one login per role" gained the `owner@gmail.com` row here (not in Step 7.2) to keep this phase's gate green.
- `permissions.test.ts`: the "finance dashboard admin-only" case is renamed to say Owner and admin.
**Gate:** `pnpm run check` green (shared 143, web 240). eslint clean on changed files.
**Notes:** new handler test proves front desk + dentist can chart and take a deposit. Demo admin (Carmen) is now Admin + Dentist at Imus only.

## Phase 7: Email sign-in, clinic chooser, suspended accounts — 2026-10-12

**Steps completed:** 7.1–7.5
**Files changed:** `packages/shared/src/schemas/auth.ts`, `packages/shared/src/domain/{permissions,permissions.test}.ts`, `apps/web/src/features/auth/{mocks.ts,api.ts,access.tsx,components/login-screen.tsx,components/clinic-chooser.tsx (new)}`, `apps/web/src/mocks/{access,demo-accounts,handlers.test}.ts`, `apps/web/src/features/portal/components/{paused-notice.tsx (new),portal-shell,portal-appointments,portal-home,portal-uploads}.tsx`
**Deviations from plan:**
- `demoLogins` sorts by role within each account (the plan's no-sort version would list the demo clinic's logins in staff order, not role order). Result: owner, admin, dentist, front desk, parent, then Ngiti's owner, matching the plan's test.
- "lists one login per role": the parent's two-children check moved inside the loop (the loop now ends on Ngiti's owner).
- `ClinicChooser` takes an `error` prop and shows it (the plan left this optional); "Use a different email" also clears the mutation error. Clinic buttons are 44 px tall (touch target rule).
- `PausedNotice` uses the `warning` status tokens with an icon, not `border-alert-line`: DESIGN_SYSTEM reserves alert tokens for allergies and patient alerts.
- Portal controls wrapped: Confirm visit (`ConfirmButton`, via `useCan`), Request an appointment (form and the Home link), the Upload form. The "Confirmed" mark still shows.
**Gate:** `pnpm run check` green (shared 144, web 240). eslint clean.
**Notes:** manual check owed: suspend Ngiti and sign in as its parent to see the notice and the hidden controls (Step 8.5 tests the server side).

## Phase 8: Branch switcher and branch-limited PIN switch — 2026-10-12

**Steps completed:** 8.1–8.5
**Files changed:** `apps/web/src/stores/session-store.ts`, `apps/web/src/features/clinic/{api.ts,components/branch-switcher.tsx (new)}`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/auth/{mocks.ts,components/switch-user-dialog.tsx}`, `apps/web/src/mocks/tenancy.test.ts`, plus the follow-up below
**Deviations from plan:**
- `BranchSwitcher` uses the kit's Radix `Select` (size `sm`, `aria-label="Branch"`), not a native `<select>`: same keyboard/screen-reader behaviour as every other picker and the kit's focus styles (ui-ux-design "Radix primitives stay").
- **Gap found in the running app, fixed:** the booking form and the recall list offered every dentist in the account, so at Dasmariñas they listed Imus-only Dr. Santos and Carmen, whom the server then refuses. Added `worksAt(staff, branch)` to `packages/shared/src/domain/tenancy.ts` (third use: booking, recalls, Switch user) with a test, and used it in `appointment-form.tsx`, `recall-list.tsx`, `switch-user-dialog.tsx`, `auth/mocks.ts` and `appointments/mocks.ts` (replacing the inline `usableBranches(...).some(...)`).
- Demo-login clinic line now wraps instead of truncating: "Bulilit Smiles Pediatric Dental · Ngiti Kids Dental" was cut off at laptop width, hiding the chooser case.
**Gate:** `pnpm run check` green (shared 145, web 245). eslint: only the pre-existing `LogoutInput` unused-import warning in `features/auth/api.ts` (present at HEAD).
**Manual checks (dev server, :3150, 2026-10-12):**
- dentist@gmail.com → "Which clinic?" with both clinics → Bulilit Smiles → Imus calendar (chairs 1–3, 8 AM). Switch to Dasmariñas → chairs 4–5, 9 AM start, tomorrow's 12:00 booking.
- Booking at Dasmariñas 5:30 PM → "Book between 9:00 AM and 5:00 PM." shown with no POST sent (the RHF resolver swap works).
- After the fix, Dasmariñas booking lists only Dr. Reyes and Dr. Villanueva; Switch user offers only Dr. Villanueva.
- Ngiti suspended (localStorage) → its parent signs in, sees the paused notice, and the next visit has no Confirm button. Ngiti restored to active afterwards.
- Phone (375 px): the switcher in the top bar squeezed to its pin icon with the chevron spilling out. **Removed from the phone top bar** (deviation from Step 8.3); phones switch branch from the More sheet, which shows it correctly ("Imus"), and the Owner is labelled "Owner".
**Not checked:** tablet rail has no switcher (open, as the plan says).

## Phase 9: Conventions — 2026-10-12

**Steps completed:** 9.1
**Files changed:** `CONVENTIONS.md`
**Deviations from plan:** added one more trap: sessions hold every role, so use `rolesCan` / `holdsRole`; `roleCan(session.role, …)` and `s.role === "dentist"` still compile but ignore a second role (the Phase 6 re-grep found five such sites).
**Gate:** `pnpm run check` green.

## Follow-up: audit findings — 2026-10-12

**Fixed:**
- **Cross-branch deposit (auditor, Medium; a plan defect in Step 3.6):** `apply-credit` stamped the deposit-side row with the invoice's branch, so a deposit taken at Dasmariñas and used on an Imus invoice stayed in Dasmariñas's "deposits held" forever. `depositSide()` in `features/billing/mocks.ts` now splits the deposit side by the branches holding the money (the invoice's branch first), and a return to deposit goes back to the branches it was drawn from. New test: `tenancy.test.ts` "deposits across branches" (fails on the old code: Dasmariñas stays +₱500).
- **Duplicated dentists-at-this-branch filter, and the `;` inside a comment:** new `useBranchStaff()` in `features/clinic/api.ts`, used by `appointment-form.tsx` and `recall-list.tsx`.
- **Default "received by" could be another branch's front desk:** `payment-dialog.tsx` and `apply-credit-dialog.tsx` fall back to this branch's front desk via `useBranchStaff()`.
- **Account lookup repeated 4×:** `accountById()` exported from `mocks/db.ts`, used in `access.ts`, `demo-accounts.ts`, `auth/mocks.ts` and `currentAccount()`.
**Left:** `documents-tab.tsx`'s front-desk default (documents are account-level, not a branch action); tablet rail switcher (open).
**Gate:** `pnpm run check` green (shared 145, web 246). eslint clean apart from the pre-existing `LogoutInput` warning.
