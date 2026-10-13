# Implementation log: Cross-branch views and operator console (chunk 21)

Follow Ups Q1–Q10 answered "yes to all" on 2026-10-13, recorded as decisions #56–#65 in
`.claude/plans/feature-primolar-platform-plan/decisions.md`. Baseline: chunk 20 closed green (shared 156, web 277).

## Phase 1: Shared contract — 2026-10-13
**Steps:** 1.1–1.3. **Files:** `packages/shared/src/schemas/operator.ts` (new), `index.ts`, `domain/tenancy.ts`
(`ALL_BRANCHES`, `reportBranchFilter`, `transferProblem`), `tenancy.test.ts`.
**Deviations:** the test's `branch()` fixture is defined inside its describe (the file's `b()` is scoped elsewhere).
**Gate:** typecheck clean; shared 164/164.

## Phase 2: Cross-branch reports in the mock API — 2026-10-13
**Steps:** 2.1–2.4. **Files:** `mocks/access.ts` (`reportBranches`, `deny` moved up), `features/dashboard/mocks.ts`,
`features/billing/mocks.ts`, `mocks/cross-branch.test.ts` (new).
**Deviations:** none. **Gate:** typecheck clean; web mock suites 146/146 (handlers.test finance totals unchanged).

## Phase 3: Branch filter in the UI — 2026-10-13
**Steps:** 3.1–3.4. **Files:** `features/dashboard/api.ts` (`branchParam`, `useReportBranch`), `billing/api.ts`,
`dashboard/components/branch-filter.tsx` (new), `dashboard-screen.tsx`, `today-glance.tsx`, `finance-dashboard.tsx`,
`billing/components/collections-list.tsx`.
**Deviations:** none. **Gate:** typecheck clean; design guards 100/100; eslint clean.

## Phase 4: Operator sign-in, token and gate — 2026-10-13
**Steps:** 4.1–4.4. **Files:** `mocks/operator.ts` (new), `mocks/access.ts` (`operatorOf`, `ACCESS_RULES`,
`OPERATOR_RULES`, `operatorRefusal`, the `/operator/*` branch), `features/operator/mocks.ts` (new), `mocks/handlers.ts`,
`mocks/operator.test.ts` (new).
**Deviations:** the handlers' doc comment no longer names `selectTenant`/`sessionOf` (the source guard matched the
comment); `OperatorUser` joined the existing shared import in access.ts. **Gate:** web mock suites 154/154.

## Phase 5: Operator account actions — 2026-10-13
**Steps:** 5.1–5.4. **Files:** `mocks/demo-accounts.ts` (`temporaryPassword`, `newPin` moved here), `mocks/db.ts`
(`emptyDb`), `features/clinic/mocks.ts`, `features/operator/mocks.ts`, `mocks/operator.test.ts`.
**Deviations:** create builds its result after the tenant exists (no `undefined!`), as the plan offered. Two comments
reworded so the source guard doesn't match prose. Store key stays v25 (no shape or seed change).
**Gate:** typecheck clean; web mock suites 158/158 (all four done-when flows).

## Phase 6: Operator console UI — 2026-10-13
**Steps:** 6.1–6.7. **Files:** `stores/operator-session-store.ts` (new), `app/providers.tsx` (401 routed by key),
`features/operator/api.ts`, `components/{operator-login,operator-shell,accounts-screen,create-account-dialog,
account-detail,status-badge}.tsx`, `components/allowance.ts` (all new), `app/operator/login/page.tsx`,
`app/operator/(console)/{layout,page}.tsx`, `app/operator/(console)/accounts/[id]/page.tsx`, `design/design-branding.test.ts`.
**Deviations:** `allowance.ts` and `status-badge.tsx` are shared by the list and the detail page (used twice each).
`useAccountAction` is generic in its result so `onSuccess` is typed. A create 409 goes on the name field; other
errors show under the form. The demo hint shows only with mocking on. The console layout sets its own page title.
**Gate:** typecheck clean; eslint clean; web 293/293.

## Phase 7: Close — 2026-10-13
**Files:** `CONVENTIONS.md` (operator row, gate row, wordmark rule, `?branch=` rule, operator trap, guard note,
demo-control deferral), `ROADMAP.md` (chunk 21 Status: built 2026-10-13).
**Gate:** `pnpm run check` green: shared 164/164, web 293/293; eslint 0 errors.
**Manual done-when (dev server :3150, demo data reset first, 2026-10-13):**
1. Bulilit Owner: "Showing" filter with All branches, Imus, Dasmariñas; choosing All sends `branch=all` to both
   reports (Dasmariñas has no seeded money today, so the totals match Imus; the combined total is proved in
   cross-branch.test.ts).
2. Carmen (admin, Imus only): no filter on Dashboard or Billing. 3. Ngiti Owner (Small): no filter.
4. `/operator` with only a clinic session → console sign-in. Operator signs in → both clinics with plan, Owner and
   counts, Primolar's colours and wordmark.
5. Created "Tala Kids Dental" (Mid) in the dialog → one-time password → signed in as owner@tala.demo with it →
   "Choose your password" → Tala's Settings, name shown as there's no logo.
6. Tala Owner added a second branch → operator set Tala to Small → detail says "over the limit for branches (2 of 1).
   Everything keeps working". Tala Owner: both branches open, Add branch disabled with the Small notice.
Not walked by hand: pause/reactivate and transfer in the UI (proved by operator.test.ts flows), dark mode and 375 px.

## Fixes after the tester and auditor — 2026-10-13

**Tester:** no failures (verification.md). **Auditor:** 77/100, all 29 steps delivered; findings fixed:
- Medium: transferring ownership could leave the old Owner assigned only to archived branches (an Owner works
  everywhere, so archiving never checked them), and then every clinic screen answered 500 for them. The transfer now
  gives an old Owner with no open recorded branch every open branch; otherwise their branches stay as recorded (#62).
- Low: `__proto__`-style ids crashed two operator routes. One `findAccount(id)` (account list first, `Object.hasOwn`)
  now serves every route, so unknown ids are 404 everywhere.
- Low: the duplicate-name check now collapses inner spaces as well as ignoring case.
- Low: `?branch=` refused with a non-Owner message for an Owner with one open branch; it now says reports across
  branches need two open branches.
- Low: the separation test now also sends the operator token by cookie alone to every clinic route, and a clinic
  token as a header to an operator route.
- Cosmetic: the `cookie()` doc comment is back above `cookie()`.
**Tests added:** 4 in `operator.test.ts`. **Gate:** `pnpm run check` green: shared 164/164, web 297/297; eslint 0 errors.
