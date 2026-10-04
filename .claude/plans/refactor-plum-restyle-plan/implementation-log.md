# Implementation log: plum restyle

User decisions (2026-10-04): Q1 build only (a) greeting + summary line and (b) the dashboard requests card, and they
must not change any existing feature, flow or permission (reuse existing data and actions only). Q2 Fredoka and the
crayon strip stay only on the login hero and the portal. Q3 avatar tints plum / teal / neutral. Q4 printed rule light
plum. Branch `feat/plum-restyle`.

## Phase 1: Foundations — 2026-10-04

**Steps completed:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
**Files changed:** `packages/shared/package.json`, `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`,
`apps/web/src/features/appointments/components/status-chip.tsx`, `apps/web/src/features/billing/components/receipt.tsx`,
`apps/web/src/features/documents/components/document-preview.tsx`, `apps/web/src/components/brand.tsx`,
`apps/web/src/features/documents/components/document-pdf.tsx`, `apps/web/src/design/source.ts`,
`apps/web/src/design/design-tokens.test.ts`
**Deviations from plan:**
- `document-pdf.tsx` mirrors the CSS tokens as hex (react-pdf can't read CSS variables); the plan didn't list it. Updated
  its INK / MUTED / LINE / LINE_STRONG copies to the new values and renamed BRAND_SOFT → BRAND_RING (#dcd3f4), so PDFs
  get the light-plum rule chosen in Q4 and the retired-name guard passes.
- `--color-scrim` added in Phase 1 (with the other tokens) rather than Step 2.4; same values.
- `source.ts` excludes `*.test.tsx` as well as `*.test.ts`.
- `opsz` axis accepted by next/font: kept.
**Gate:** `pnpm run check -- design-tokens` → typecheck ok, 62 tests passed. Full `pnpm run check` → shared 99, web 158 passed.
**Notes:** Screenshot pass at 390/820/1440 light+dark on dashboard, appointments week, patients: plum brand, warm-grey
ground, Bricolage titles. Transitional as the plan expects: lilac selected nav with bar, ink-edged outline buttons (Phase 2/3).

## Phase 2: Primitives — 2026-10-04

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
**Files changed:** `components/ui/{button,input,textarea,select,dropdown-menu,tabs,dialog,sheet,badge}.tsx`,
`components/{section-card,empty-state,coming-soon,segmented}.tsx`, `design/design-primitives.test.ts`, `apps/web/vitest.config.ts`
**Deviations from plan:**
- `vitest.config.ts`: added `oxc: { jsx: { runtime: "automatic" } }`. tsconfig has `jsx: "preserve"` (Next), so the
  plan's render-based guard couldn't parse `.tsx` imports. Test-only change.
- Test passes SectionCard's children as a prop (its type requires `children`).
**Gate:** `pnpm run check -- design` → 71 passed; full `pnpm run check` → shared 99, web 167 passed.
**Notes:** Screenshots (record 1440, patients 390 dark, dashboard): outline buttons now hairline; Book appointment,
Quick update read correctly. Filter chips / list styling untouched until Phase 4.

## Phase 3: Shell — 2026-10-04

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
**Files changed:** `components/app-shell.tsx`, `features/patients/components/patient-search.tsx`,
`features/auth/components/account-menu.tsx`, `design/design-shell.test.ts`
**Deviations from plan:** none
**Gate:** full `pnpm run check` → shared 99, web 172 passed.
**Notes:** Screenshots at 1440/820/390 light+dark and sign-out at 1440/390: no crayon strip, neutral active pill with
plum icon (sidebar, rail), top-edge bar on the phone tab, ink "Sign out" with the account row, bottom sheet with handle
on phones. Minor: in the bordered sidebar account card a long name ("Carmen Dela Cruz") truncates by a few letters.

## Phase 4: Screen patterns — 2026-10-04

**Steps completed:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
**Files changed:** `lib/format.ts`, `features/auth/components/account-menu.tsx`, `features/dashboard/components/{dashboard-screen,today-glance,finance-dashboard,charts}.tsx`,
`features/appointments/components/{appointment-requests,appointment-calendar,agenda-list}.tsx`, `app/globals.css`,
`features/patients/components/{patient-avatar,patient-list,patient-header,patient-record}.tsx`,
`design/design-screens.test.ts`, `design/design-tokens.test.ts`
**Deviations from plan:**
- **Booking requests cell kept in the banner** (5 cells for appointments.manage, 4 otherwise), on top of the new
  requests card. User instruction (2026-10-04): the additions must not change any existing feature or workflow, and the
  plan's 4.2 removed that shortcut to `/appointments#requests`.
- Banner stat row switches to its side-by-side layout at `xl` (not `lg`): with 5 cells there wasn't room at 1024–1279.
- Phone banner cells are compact (3 columns, smaller number, hint hidden below `sm` — still in the aria-label), so
  five cells don't push the content below the fold.
- Chair header counts only events on the shown day (`format(e.start) === day`), not every loaded event.
**Gate:** full `pnpm run check` → shared 99, web 180 passed.
**Notes:** Requests card on the dashboard is the unchanged `AppointmentRequests` (own Book form + Mark handled), shown
under the same `appointments.manage` gate as the tile. Screenshots: dashboard 1440/390 light+dark, appointments day
1440, record 1440, patients 390.

## Phase 5: Sweep — 2026-10-04

**Steps completed:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
**Files changed:** `features/messages/components/template-editor.tsx`, `features/documents/components/documents-tab.tsx`,
`features/auth/components/{switch-user-dialog,login-screen}.tsx`, `features/chart/components/dental-chart.tsx`,
`features/photos/components/photos-tab.tsx`, `features/recalls/components/recall-list.tsx`,
`features/visits/components/visit-banner.tsx`, `features/portal/components/{portal-shell,portal-home,portal-records,portal-uploads}.tsx`,
`design/design-sweep.test.ts`, `design/design-tokens.test.ts`
**Deviations from plan:**
- documents-tab: the selected type's label goes bold via `[&>span:first-child]:font-bold` (its button holds a label and a
  description span; only the label should be bold).
- Dentition Segmented gets `w-full sm:w-fit` (three options fill a phone width).
- Removed the now-unused `Button` imports in dental-chart and photos-tab.
**Gate:** full `pnpm run check` → shared 99, web 188 passed.
**Notes:** Screenshots: portal home 390 (Fredoka greeting, strip, top-edge tab), record chart 390 (Segmented dentition and
side), messages 1440, recalls, settings, portal billing light+dark. `/billing` at 390 hit a one-off navigation abort in
the script (1440 captured fine).

## Phase 6: Dark-mode and print audit — 2026-10-04

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `app/globals.css` (dark chart pair + comments), `design/design-tokens.test.ts` (lightness floor)
**Deviations from plan:** The plan's suggested fix (#8a6fe0 / #5fd0c0) failed the validator's dark lightness band
(teal L 0.79 > 0.67). Final dark pair **#8a6fe0 / #3aa898**: `validate_palette.js --mode dark --surface #1a1c1b` →
all checks pass (CVD ΔE 15.6 deutan, tritan 11.9); pair lightness ratio 1.33 (≥ 1.3 floor). Light pair
#5b3fa8 / #2a9d8f → all pass (CVD ΔE 23.1, normal ΔE 27.6).
**Gate:** `pnpm run check -- design-tokens` → 68 passed.
**Notes:** Dark matrix (390/820/1440): dashboard, appointments week/month, record billing, billing, recalls, documents,
settings, portal plan. No white panels, fields keep visible edges, banner reads on the dark ground, sign-out ink inverts,
chart tooltips dark. Dark Segmented: the active pill is the surface colour on a slightly lighter track; it is marked by
bold ink text as well, so acceptable. Print: receipt printed from dark mode renders on white with the light-plum rule.

## Phase 7: Documentation — 2026-10-04

**Steps completed:** 7.1, 7.2, 7.3
**Files changed:** `DESIGN_SYSTEM.md`, `UI_AUDIT.md`, `CONVENTIONS.md`
**Deviations from plan:** UI_AUDIT §3 palette gets a "superseded" note rather than an in-place rewrite, so the earlier
direction stays readable as history.
**Gate:** full `pnpm run check` → shared 99, web 190 passed.

## Not implemented (by decision)

- Q1 (c)–(f): Start visit inside the identity card, phone week strip, "Next up" line, nav request badge.
- Minor, open: in the desktop sidebar's bordered account card, a long name ("Carmen Dela Cruz") truncates by a few letters.
