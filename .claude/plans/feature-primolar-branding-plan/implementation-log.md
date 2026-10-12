# Implementation log: Owner settings and clinic branding (chunk 20)

Follow Ups #1–#9 answered "yes to all" on 2026-10-12, recorded as decisions #47–#55 in
`.claude/plans/feature-primolar-platform-plan/decisions.md`. Baseline: chunk 19 closed green (shared 145, web 246).

## Phase 1: Shared contract — 2026-10-12

**Steps completed:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
**Files changed:** `packages/shared/src/domain/branding.ts` (new), `branding.test.ts` (new), `index.ts`,
`schemas/tenancy.ts`, `schemas/clinic.ts`, `schemas/auth.ts`, `domain/permissions.ts`, `permissions.test.ts`,
`domain/tenancy.ts`, `tenancy.test.ts`; `apps/web/src/mocks/seed.ts`, `seed-ngiti.ts`, `design/design-tokens.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm run typecheck` clean; shared vitest 156/156; web `src/design` + seed + tenancy suites 122/122
**Notes:** hex-guard allowlist gained the two seed files (Step 1.3), as planned.

## Phase 2: Mock backend — 2026-10-12

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
**Files changed:** `apps/web/src/mocks/db.ts`, `seed.ts`, `seed-ngiti.ts`, `seed.test.ts`, `access.ts`,
`demo-accounts.ts`, `owner-settings.test.ts` (new); `public/demo/bulilit-logo.svg`, `ngiti-logo.svg` (new);
`features/clinic/mocks.ts`, `features/auth/mocks.ts`, `features/billing/mocks.ts`, `features/visits/mocks.ts`;
`packages/shared/src/schemas/tenancy.ts` (`ClinicContext.logoUrl`)
**Deviations from plan:** `passwordOpens` sits at the end of `demo-accounts.ts` rather than beside `DEMO_PASSWORD`
(it needs the `DemoAccountRecord` type declared below it). No behaviour difference.
**Gate:** `pnpm run typecheck` clean; web vitest 264/264 (17 files), owner-settings 16/16
**Notes:** mock store key is now v25; an open browser tab reseeds on next load.

## Phase 3: Runtime branding — 2026-10-12

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
**Files changed:** `app/layout.tsx`, `app/manifest.ts`, `app/login/page.tsx`, `app/globals.css` (comments);
`features/clinic/brand-css.ts` (+test, new), `components/brand-theme.tsx`, `components/clinic-logo.tsx` (new),
`features/clinic/api.ts` (`useBranches`); `components/brand.tsx`, `components/app-shell.tsx`,
`features/portal/components/portal-shell.tsx`; `app/(clinic)/loading.tsx`, `app/(portal)/loading.tsx`,
`app/(clinic)/patients/page.tsx`, `app/(clinic)/appointments/page.tsx`; `features/billing/components/receipt.tsx`;
`features/documents/content.ts` (+test), `api.ts`, `download.ts`, `components/document-preview.tsx`,
`components/document-pdf.tsx`; `design/design-shell.test.ts`, `design/design-branding.test.ts` (new)
**Deviations from plan:**
- Decision #52 (answered after the plan): the in-app page loader shows the clinic's mark. `PageLoading` gained an
  optional `mark`; `ClinicPageLoading` (clinic-logo.tsx) passes a bobbing `ClinicMark`, used by both shells and the four
  route fallbacks. `LoadingScreen` (cold start) stays Primolar but loses the "Pediatric Dental Clinic" tagline; the page
  title, login title and manifest become plain "Primolar".
- `ClinicMark` shows a skeleton until `/clinic` answers (the plan rendered an empty square) and takes a `className`.
- The content-test fixture's ring colour is derived from `DEFAULT_BRAND_COLOR`, not a hex literal, to stay clear of
  the hex guard. Document letterhead case uses issuer `staff_reyes`.
- `brand.tsx`'s header comment no longer names `primolar-logo.png` (the new guard forbids the filename in src). The
  PNG stays in `public/brand`, unreferenced by code.
**Gate:** `pnpm run typecheck` clean; web vitest 271/271 (19 files); eslint clean

## Phase 4: Owner screens and close — 2026-10-12

**Steps completed:** 4.1–4.11
**Files changed:** `features/clinic/api.ts` (Owner hooks); `features/clinic/components/settings-screen.tsx`,
`clinic-profile-form.tsx`, `branding-form.tsx`, `branches-panel.tsx`, `staff-panel.tsx`, `plan-panel.tsx`,
`limit-notice.tsx`, `settings.test.ts` (all new), `clinic-settings.tsx` (`embedded`), `clinic-logo.tsx` (`onError`);
`app/(clinic)/settings/page.tsx`; `features/billing/components/payment-dialog.tsx`, `apply-credit-dialog.tsx`;
`features/documents/components/document-options.tsx`; `features/auth/api.ts` (`useChangePassword`),
`components/change-password-screen.tsx` (new), `components/access-gate.tsx`; `CONVENTIONS.md`, `ROADMAP.md`
**Deviations from plan:**
- The settings tab strip uses the patient record's pattern (`scroll-fade-x`, `variant="line"`) so five tabs scroll at 375 px.
- Add-staff dialog hides its X once the temporary password shows ("I've passed it on" is the way out); Escape and the
  overlay are blocked too. Branch and weekday checkboxes carry `aria-label` (found unnamed in the accessibility tree).
- The branding preview shows the typed colour only once it passes; a refused colour shows the alert and "Use #…".
- `ClinicLogo` `onError` fallback (plan Issues, Phase 4) was done here, in clinic-logo.tsx.
- CONVENTIONS also records the Primolar-logo guard and that Owner-settings tests live in `owner-settings.test.ts`.
**Gate:** `pnpm run check` green: shared 156/156 (20 files), web 273/273 (20 files); typecheck clean; eslint clean.
**Manual done-when (dev server :3150, 2026-10-12):**
1. owner@ngiti.demo → Settings → Staff: "5 of 5", Add staff disabled, the Small-plan notice shown. Deactivated Joy Tan →
   Add enabled → added Nora Ramos → temporary password and PIN shown once → Add disabled again at 5 of 5. Signed in as
   Nora with the temporary password → "Choose your password" only → changed → landed on Appointments, Ngiti-branded.
2. Ngiti: blue and its logo in the sidebar. Bulilit: its logo and colour in the sidebar, the portal at 375 px (as
   parent@gmail.com), a receipt on screen (Imus branch line) in light and dark (logo on a white plate in dark), and
   the receipt PDF (built in the page, download intercepted): clinic logo rasterised, branch line, brand-coloured rule.
3. Branding: `#e07a48` refused with "2.6:1 … needs 4.5:1" and "Use #b04f18" → used → saved → the whole app recoloured.
4. 375 px Settings: tab strip scrolls; no horizontal page scroll (scrollWidth 375).
Not checked by hand: the Branches tab add/archive dialogs (covered by owner-settings.test.ts) and the tablet rail mark.

## Fixes after the tester and auditor — 2026-10-13

**Auditor findings fixed:**
- Medium: two active logins could share one email (add skipped deactivated staff; reactivate never checked). `emailTaken`
  / `staffEmail` (demo-accounts.ts) count deactivated logins; add and reactivate both refuse with 409.
- Medium: `GET /staff` served sign-in emails and deactivation dates to parents. Now `email` goes to the Owner only and
  `deactivatedAt` to staff only (pickers still need it).
- Low: wide logos were unreadable in the 48 px `ClinicMark` (rail and in-app loader, both demo logos). It now measures
  the logo once per URL and shows the initial tile when wider than 1.5:1.
- Low: `POST /auth/password` refuses seeded demo logins (403), so `pass123` stays true; `/auth/switch` refuses a
  session that must still change its password.
- Smells: `LOGO_RULES.maxBytes` replaces a literal; `branding-form.tsx` uses `HexColor` instead of its own regex;
  billing's three active-staff checks share `isActiveStaffId`.
- CONVENTIONS names the two brand-colour exceptions (PDF ring, unsaved preview) and the `/staff` field rules.
**Not changed:** lenient branch address/phone validation (chunk 19's `Branch` schema, as planned); the two eslint
warnings that predate this chunk (`brand.tsx:114` from the rebrand, unused `LogoutInput`).
**Tests added:** 5 in `owner-settings.test.ts` (email reuse on add and on reactivate, `/staff` fields per role, demo
password kept, switch blocked during a forced change).
**Gate:** `pnpm run check` green: shared 156/156, web 277/277; eslint 0 errors. Tablet rail checked at 768 px: Ngiti
shows its "N" tile.
