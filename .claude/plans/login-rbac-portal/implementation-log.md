# Implementation log: login-rbac-portal

User approved every open question (Q1–Q10) with the plan's defaults on 2026-10-03.

## Phase 1: Shared RBAC contract — 2026-10-03

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/schemas/{auth.ts (new),appointment.ts}`, `packages/shared/src/domain/{permissions.ts,permissions.test.ts}` (new), `packages/shared/src/index.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` — pass (shared 59/59, web 47/47)
**Notes:** none.

## Phase 2: Mock auth, sessions and the access gate — 2026-10-03

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
**Files changed:** `apps/web/src/mocks/{seed,db,handlers,handlers.test}.ts`, `apps/web/src/mocks/{demo-accounts,access}.ts` (new), `apps/web/src/features/auth/mocks.ts` (new), `apps/web/src/features/{patients,appointments}/mocks.ts`
**Deviations from plan:** `handle()` in demo-accounts.ts writes the diacritics range as `̀-ͯ` escapes, not the literal combining characters in the plan (same behaviour, readable).
**Gate:** `pnpm run check` — pass (shared 59/59, web 52/52)
**Notes:** Mock DB key now v14. Checked 2026-10-03 that all 45 existing mock routes have a rule in `RULES`. As the plan warns, the running app answers 401 until Phase 3 lands.

## Phase 3: Session, login screen and account switching — 2026-10-03

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 (gates only; browser plan handed to the tester)
**Files changed:** `apps/web/src/stores/session-store.ts` (new), `apps/web/src/stores/role-store.ts` (deleted), `apps/web/src/features/auth/{api.ts,access.tsx}` (new), `apps/web/src/features/auth/components/{login-screen,account-menu,access-gate}.tsx` (new), `apps/web/src/app/login/page.tsx` (new), `apps/web/src/app/{page,providers}.tsx`, `apps/web/src/app/(clinic)/layout.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/dashboard/components/finance-dashboard.tsx`
**Deviations from plan:** none. I loaded ui-ux-design first and kept the plan's markup, which already follows its design notes.
**Gate:** `pnpm run check` — pass (shared 59/59, web 52/52); `pnpm --filter web lint` — clean. The first typecheck failed on `.next/types/validator.ts` ("/login" not in AppRoutes): Next's generated route types were out of date. Requesting `/login` once from the running dev server (PID 81227, cwd apps/web, port 3100; reused, not restarted) regenerated them.
**Notes:** Phases 2 and 3 land together, as the plan requires. The Phase 3 browser test plan has not been run yet.

## Phase 4: RBAC in the staff app — 2026-10-03

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/{visits/components/visit-banner,notes/components/notes-tab,chart/components/tooth-panel,plan/components/plan-tab,growth/components/growth-card,photos/components/photos-tab,appointments/components/appointment-sheet,billing/components/billing-tab,patients/components/patient-list,patients/components/patient-overview}.tsx`
**Deviations from plan:** none.
**Gate:** `pnpm run check` — pass (shared 59/59, web 52/52); `pnpm --filter web lint` — clean.
**Notes:** `grep "role ===" features/*/components`, excluding `"dentist"`, finds only the login screen's parent grouping and two `"front_desk"` default-receiver data filters (payment-dialog, documents-tab). None of these is an access check. The browser test plan has not been run yet.

## Phase 5: Portal backend (Chunk 17) — 2026-10-03

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `packages/shared/src/schemas/photo.ts`, `apps/web/src/features/photos/{mocks.ts,components/upload-photo-dialog.tsx}`, `apps/web/src/features/appointments/{mocks,api}.ts`, `apps/web/src/features/messages/api.ts`, `apps/web/src/mocks/handlers.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` — pass (shared 59/59, web 56/56)
**Notes:** The Chunk 17 done-when is proven through the real handlers by `describe("parent portal")`.

## Phase 6: Portal screens 1 — shell, home, appointments — 2026-10-03

**Steps completed:** 6.1, 6.2, 6.3, 6.4 (gates only)
**Files changed:** `apps/web/src/features/portal/{use-child.ts,components/portal-shell.tsx,components/portal-home.tsx,components/portal-appointments.tsx}` (new), `apps/web/src/app/(portal)/layout.tsx` (new), `apps/web/src/app/(portal)/portal/page.tsx`, `apps/web/src/app/(portal)/portal/appointments/page.tsx` (new)
**Deviations from plan:** none. ui-ux-design was already loaded in this session (Phase 3), and the plan's design brief was followed as written.
**Gate:** `pnpm run check` — pass (shared 59/59, web 56/56); `pnpm --filter web lint` — clean.
**Notes:** The browser test plan has not been run yet.

## Phase 7: Portal screens 2 — plan, bills, care, uploads; staff requests inbox — 2026-10-03

**Steps completed:** 7.1, 7.2, 7.3
**Files changed:** `apps/web/src/features/portal/components/{portal-records,portal-uploads}.tsx` (new), `apps/web/src/app/(portal)/portal/{plan,billing,care,uploads}/page.tsx` (new), `apps/web/src/features/appointments/components/appointment-requests.tsx` (new), `apps/web/src/app/(clinic)/appointments/page.tsx`
**Deviations from plan:** none.
**Gate:** `pnpm run check` — pass (shared 59/59, web 56/56); `pnpm --filter web lint` — clean. `next build` — pass (21/21 pages, `/portal` 237 kB and `/login` 193 kB first load). I ran the build in a throwaway scratchpad copy of the tree (node_modules symlinked) and deleted the copy afterwards, so the dev server's `apps/web/.next` was untouched.
**Notes:** Neither browser test plan (Phase 6 or 7) has been run. The plan flags refund and payment signs on the bills page for a visual check (payments show as −₱ against the total, refunds as +₱).

## Phase 8: Documentation — 2026-10-03

**Steps completed:** 8.1. Step 8.2 (mark Chunk 17 done in ROADMAP.md) is **held**: the plan makes it conditional on Phase 7's browser test plan passing, and that has not run yet.
**Files changed:** `CONVENTIONS.md`
**Deviations from plan:** I also changed the "Users:" line from "parents (portal, later)" to "parents (portal, through the demo login)", because the old wording is out of date once this lands. The reset-demo-data row now points to the account menu first.
**Gate:** `pnpm run check` — pass (shared 59/59, web 56/56)
**Notes:** Hand-off: the tester runs the browser plans for Phases 3, 4, 6 and 7 against the running dev server (PID 81227, port 3100). The v14 key reseeds on first load.

## Post-verification fixes — 2026-10-03

Tester report: `verification.md`. Phase 3 12/12, Phase 4 9/9, Phase 6 11/12, Phase 7 11/11. Chunk 17 done-when confirmed in the browser.

**Files changed:** `apps/web/src/mocks/demo-accounts.ts`, `apps/web/src/mocks/handlers.test.ts`, `apps/web/src/features/portal/components/{portal-home,portal-appointments,portal-records}.tsx`, `ROADMAP.md`
**Changes:**
1. Phase 6 row 7 (real failure): the "Has an appointment to confirm" parent was picked by any future booked appointment, but portal Home shows only the next visit, which was `confirmed`. The pick now requires the child's next upcoming visit (same statuses as the portal's "Coming up") to be `booked`. A new handler test, "offers a 'to confirm' parent whose child's next visit is still booked", pins this. It encodes the tester's failing case; I did not run it against the old code.
2. Phase 7 row 3 (sign presentation, Low): a refund now reads "Refunded to you … +₱500.00". Amounts and receipt numbers are `whitespace-nowrap`, so the sign no longer detaches at 390 px.
3. Phase 6 row 11 (Low): the Home card links are now 44 px targets (`inline-flex min-h-11`), and the request date input is `min-h-11`.
4. Step 8.2: Chunk 17 marked done in ROADMAP.md, and the feature 6 "Prototype:" line updated.

**Not changed:** Phase 7 row 7's "type filter" was a plan error (the staff Photos tab has none). Fixes 1–3 are verified by the check and the new test only; the browser rows were not re-run.
**Gate:** `pnpm run check` — pass (shared 59/59, web 57/57); `pnpm --filter web lint` — clean.
