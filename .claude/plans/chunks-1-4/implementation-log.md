# Implementation log: ROADMAP Chunks 1–4

No architect plan exists for this work; the plan is `ROADMAP.md` Part 2, Chunks 1–4. Each chunk's
"Done when" is its acceptance check.

## Phase 1: UI kit (Chunk 1) — 2026-10-02

**Steps completed:** shadcn components (button, input, label, select, textarea, checkbox, dialog,
sheet, tabs, toast, badge, dropdown-menu); `FormField`; "Reset demo data" button in the shell.
**Files changed:** `apps/web/components.json`, `apps/web/src/components/ui/*` (12 generated),
`apps/web/src/components/form-field.tsx`, `apps/web/src/app/globals.css`,
`apps/web/src/app/providers.tsx`, `apps/web/src/components/app-shell.tsx`,
`apps/web/src/features/patients/components/patient-list.tsx`, `apps/web/package.json`, `pnpm-lock.yaml`.
**Deviations from plan:**
- "toast" is shadcn's `sonner` component; shadcn deprecated its old toast in favour of it.
- `components.json` was written by hand instead of `shadcn init`, so init would not replace the
  project's design tokens. shadcn's semantic colour names are aliased onto the existing tokens in
  `globals.css` (`@theme inline`), so the generated files stay unedited.
- The shadcn CLI resolved the `cn` util alias to an unrelated npm package named `cn` and did not
  install `lucide-react` or `class-variance-authority`. Removed `cn` (imports now point at
  `@/lib/utils`), added the two missing deps plus `tw-animate-css` (the components' animation classes).
- Dropped `next-themes` from `sonner.tsx`; the app has no dark mode.
- The existing hand-styled search input and role select now use the kit.
- "A sample form uses only kit components" is checked with the real patient form in Phase 3,
  not a throwaway demo page.
**Gate:** `pnpm run typecheck` — green.
**Notes:** Kit inputs are 36px tall (`h-9`); the old hand-styled ones were 44px.

## Phase 2: Clinic setup data (Chunk 2) — 2026-10-02

**Steps completed:** `StaffMember`, `Chair`, `Procedure` schemas; seed data; read-only Settings page.
**Files changed:** `packages/shared/src/schemas/clinic.ts`, `packages/shared/src/index.ts`,
`apps/web/src/mocks/{db,seed,handlers}.ts`, `apps/web/src/features/clinic/{api,mocks}.ts`,
`apps/web/src/features/clinic/components/clinic-settings.tsx`, `apps/web/src/app/(clinic)/settings/page.tsx`,
`apps/web/src/components/app-shell.tsx`, `apps/web/vitest.config.ts`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- The catalog has no separate "follow-up rule" field. `Procedure.code` is the same key
  `findRule()` already uses, so the Settings page derives the rule instead of storing it twice.
- Added `perTooth` to `Procedure` (restorations, sealants, extractions… are billed per tooth);
  billing in Chunk 12 needs it.
- Added a 12th procedure, `follow_up` (₱500). Fees are chosen so Chunk 12's ₱8,500 example
  (cleaning, fluoride, 3 restorations, follow-up) adds up exactly.
- Settings is visible to all staff roles, read-only.
**Gate:** `pnpm run typecheck` — green. `vitest run` (web) — 3/3 passed.
**Notes:** Mock DB key bumped to `v2`. `handlers.test.ts` runs every handler through the real
`api()` client under `msw/node`; `vitest.config.ts` sets an absolute `NEXT_PUBLIC_API_URL` for it.

## Phase 3: Patient profile complete (Chunk 3) — 2026-10-02

**Steps completed:** create and edit forms (guardians add/remove/primary, emergency contact, allergies,
conditions, medications, alerts, dental history); consent records; record page with 7 tabs.
**Files changed:** `packages/shared/src/schemas/patient.ts`, `apps/web/src/mocks/{seed,db}.ts`,
`apps/web/src/features/patients/{api,mocks}.ts`, `apps/web/src/features/patients/components/`
(`patient-form`, `tag-input`, `patient-editors`, `patient-record`, `patient-overview`, `consent-dialog`,
`patient-list`), `apps/web/src/components/form-field.tsx`, routes `patients/new`,
`patients/[patientId]/edit`, `patients/[patientId]`.
**Deviations from plan:**
- `Patient` gained `dentalHistory` and `consents`. Consents are added only through
  `POST /patients/:id/consents` and are not part of the edit input, so a profile save can't overwrite them.
  `PUT /patients/:id` returns 409 when it would remove a guardian who signed a consent.
- `CreatePatientInput` now requires exactly one primary guardian (the roadmap says "mark primary").
- `ConsentScope` is an enum (general treatment, local anesthesia, extraction, X-rays, clinical photos,
  sedation) rather than free text, so Chunk 16's consent forms can key off it.
- `FormField` also accepts a render function, because Radix `Select` roots can't take the label's id via `Slot`.
- `persist()` in `mocks/db.ts` now has the same `typeof window` guard as `load()` (needed for handler tests).
**Gate:** `pnpm run typecheck` — green. `vitest run` (web) — 7/7.
**Notes:** Bug found in the browser and fixed: the tag input added its chip on blur *below* the input,
which pushed the submit button down mid-click and swallowed the click. Chips now sit inline.

## Phase 4: Visits (Chunk 4) — 2026-10-02

**Steps completed:** `Visit` schema and mocks; "Start visit" on the record; visit list on Overview.
**Files changed:** `packages/shared/src/schemas/visit.ts`, `packages/shared/src/index.ts`,
`apps/web/src/mocks/{db,seed,handlers}.ts`, `apps/web/src/features/visits/{api,mocks}.ts`,
`apps/web/src/features/visits/components/{visit-banner,visit-list}.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- Added "Finish visit" (`POST /visits/:id/complete`). Without it the current visit could never end,
  so "the current visit is clear" would mean nothing.
- The current visit is shown in a banner above the tabs, not only on Overview, so later tabs
  (chart, notes) show which visit they write to. One visit in progress per patient (409 otherwise);
  only staff with role `dentist` can run one.
- Seeded 0–3 completed past visits per patient; none in progress.
**Gate:** `pnpm run check` — green (shared 12/12, web 10/10). `eslint` — clean.
**Notes:** Browser check (Playwright driving Chrome against `pnpm dev`, 18 checks, all passing):
create patient → refresh → still there; alert banner on all 7 tabs and the edit page; start visit →
banner + list mark it current, survives refresh, visible from other tabs → finish clears it; consent
recorded; edit adds a second guardian, switches primary, keeps consents; search finds the new patient;
Settings lists 12 procedures; record page has no horizontal scroll at 390px; no console errors.
The script lives in the session scratchpad, not the repo.
