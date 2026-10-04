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
