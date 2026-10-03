# Implementation log: ROADMAP Chunks 14, 16 and 13

Plan: `chunks-13-14-16-plan.md`. Baseline: the plan says "dirty tree with Chunks 11-12 uncommitted", but at
the start of implementation (2026-10-03) the working tree was clean on `master` at `d94e871` (Chunks 11-12
are committed in `4138044`). `pnpm run check` baseline: shared 41/41, web 33/33. Defaults taken for every open
question Q1–Q11.

## Phase 1: Messages, shared contract and rendering rules (Chunk 14) — 2026-10-03

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/schemas/message.ts` (new), `packages/shared/src/domain/messages.ts` (new), `packages/shared/src/domain/messages.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** `unknownPlaceholders` maps `m[1]!` instead of `m[1]`: the repo compiles with `noUncheckedIndexedAccess`, so the plan's code did not typecheck. The capture group always exists when the regex matches.
**Gate:** `pnpm run check` — pass (shared 45/45, web 33/33)
**Notes:** kept `superRefine` (Zod 4 still supports it).

## Phase 2: Messages, mock backend and event hooks (Chunk 14) — 2026-10-03

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
**Files changed:** `apps/web/src/mocks/message-templates.ts` (new), `apps/web/src/mocks/outbox.ts` (new), `apps/web/src/features/messages/mocks.ts` (new), `apps/web/src/mocks/{db,seed,handlers,handlers.test}.ts`, `apps/web/src/features/appointments/mocks.ts`, `apps/web/src/features/notes/mocks.ts`
**Deviations from plan:** the `describe("parent messages")` bookings use **2030-04-01..03** instead of 2030-03-04..06. The `appointments` describe already books staff_reyes / chair_3 at 2030-03-04T01:00 (line 381, the reschedule test), which the plan's slot inventory missed, so the first test got a 409. In the tests, indexed results (`m!`, `due!`, `reminder!`, `instructions!`, `confirmation!`) carry non-null assertions for `noUncheckedIndexedAccess`.
**Gate:** `pnpm run check` — pass (shared 45/45, web 39/39)
**Notes:** mock DB key v10 → v11. `seedAppointments` is hoisted to a const after `seedExamplePlan`, so the faker order is unchanged (the Chunk 9/10 tests still pass). `GET /messages` runs `runDailyJobs()` (birthdays, Q3).

## Phase 3: Messages screens (Chunk 14) — 2026-10-03

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5
**Files changed:** `apps/web/src/features/messages/api.ts` (new), `apps/web/src/features/messages/components/{message-log,template-editor,messages-screen}.tsx` (new), `apps/web/src/app/(clinic)/messages/page.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/appointments/api.ts`, `apps/web/src/features/notes/api.ts`, `apps/web/src/features/recalls/components/recall-list.tsx`
**Deviations from plan:** I loaded the ui-ux-design skill first. The plan's components are kept as written, with two accessibility changes in `template-editor.tsx`:
(1) The placeholder chips drop `aria-label="Insert Child's first name"`. That label did not contain the visible text `{child_first_name}` (WCAG 2.5.3 Label in Name, severity 2). The chips now use the visible text as their name, with the plain-language label as a `title` tooltip.
(2) The preview drops `aria-live="polite"`. A live region that changes on every keystroke makes a screen reader announce the whole preview after each character (severity 2). The character and segment count stays tied to the field through `aria-describedby`.
The recall row's aria-label reads "Send reminder about …" so it starts with the visible text.
**Gate:** `pnpm run check` — pass (shared 45/45, web 39/39); `pnpm --filter web lint` — pass (no output)
**Notes:** no dev server or browser check was run (per instructions). The tester agent should run the plan's Phase 3 browser test plan (10 rows), including 390px width and keyboard-only. Messages NAV roles stay admin + front desk.

## Phase 4: Documents, shared contract and formulary (Chunk 16) — 2026-10-03

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `packages/shared/src/domain/documents.ts` (new), `packages/shared/src/schemas/document.ts` (new), `packages/shared/src/domain/documents.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** the test uses `FORMULARY[0]!.defaultSig` because of `noUncheckedIndexedAccess`. Otherwise the code is as written.
**Gate:** `pnpm run check` — pass (shared 49/49, web 39/39)
**Notes:** the formulary and controlled flags are demo data for the clinic to confirm (Q6).

## Phase 5: Documents, mock backend (Chunk 16) — 2026-10-03

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/web/src/mocks/{db,seed,handlers,handlers.test}.ts`, `apps/web/src/features/documents/mocks.ts` (new)
**Deviations from plan:** none. The code is as written. `apps/web` typechecks without `noUncheckedIndexedAccess` errors here, so the tests needed no `!`.
**Gate:** `pnpm run check` — pass (shared 49/49, web 42/42)
**Notes:** mock DB key v11 → v12. `describe("documents")` is the last describe in `handlers.test.ts`, after `billing`.

## Phase 6: Documents, content builders and the PDF renderer (Chunk 16) — 2026-10-03

**Steps completed:** 6.1, 6.2, 6.3, 6.4, 6.5
**Files changed:** `apps/web/src/features/billing/receipt-rows.ts` (new), `apps/web/src/features/billing/components/receipt.tsx`, `apps/web/src/features/plan/{api.ts,components/plan-tab.tsx,components/add-to-plan.tsx}`, `apps/web/src/features/patients/{api.ts,components/consent-dialog.tsx,components/patient-overview.tsx}`, `apps/web/src/features/documents/{content.ts,content.test.ts,download.ts,components/document-pdf.tsx}` (new), `apps/web/public/fonts/{NotoSans-Regular.ttf,NotoSans-Bold.ttf,OFL.txt}` (new)
**Deviations from plan:** (1) In `content.ts` the diacritic-stripping regex is written `/[̀-ͯ]/g` instead of the plan's literal combining characters. Same behaviour, but readable, and it avoids lint's misleading-character-class rule. (2) No Q2 fallback was needed. The fonts were downloaded from `github.com/notofonts/notofonts.github.io` (static hinted TTF, about 620 KB each), with `OFL.txt` from `notofonts/latin-greek-cyrillic`.
**Gate:** `pnpm run check` — pass (shared 49/49, web 45/45)
**Notes:** I checked the glyphs with fontkit: both TTFs have U+20B1 (₱) and U+00F1 (ñ). I also ran a throwaway Node smoke render of `documentPdf` (a temporary vitest config with an automatic JSX runtime and absolute font paths; both files were deleted afterwards). It produced a valid A4 PDF that shows `₱8,500.00` and "Niño Peña" in Noto Sans, with the table, the signature line and a fixed footnote. The label-map moves (`PLAN_STATUS_LABEL` to `plan/api.ts`, `CONSENT_LABEL` to `patients/api.ts`) are verbatim. `receipt.tsx` now shows `CLINIC_NAME` (same value, "Pedia Dental").

## Phase 7: Documents screens (Chunk 16) — 2026-10-03

**Steps completed:** 7.1, 7.2, 7.3, 7.4, 7.5
**Files changed:** `apps/web/src/features/documents/api.ts` (new), `apps/web/src/features/documents/components/{document-preview,document-options,download-document-button,documents-tab,document-log}.tsx` (new), `apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/features/billing/components/receipt.tsx`, `apps/web/src/app/(clinic)/documents/page.tsx`, `apps/web/src/components/app-shell.tsx`
**Deviations from plan:** I loaded the ui-ux-design skill first. The plan's code is kept, with three accessibility changes:
(1) `document-options.tsx`: each prescription's medicine select had no programmatic label, only the fieldset legend (WCAG 1.3.1 / 4.1.2, severity 3). It is now wrapped in `Field` with the label "Medicine", which also renders its error, so the hand-written error `<p>` is gone.
(2) `documents-tab.tsx`: the selected document type was shown by colour alone (project non-negotiable 2, WCAG 1.4.1, severity 2), and the plain `<button>`s had no focus style matching the app's. The selected type now gets the NAV's brand bar as well, and each button has `focus-visible:ring-2 ring-ring` (WCAG 2.4.7).
(3) `download-document-button.tsx` gains an optional `ariaLabel`. Each "Download again" row in Issued documents passes "Download again: <type>, <date time>", so the identical buttons can be told apart (WCAG 2.4.6, severity 2). The name starts with the visible text (2.5.3).
**Gate:** `pnpm run check` — pass (shared 49/49, web 45/45); `pnpm --filter web lint` — pass (no output). `pnpm build`: a dev server from this repo was listening (PID 81227, port 3100, cwd `apps/web`), so I did **not** build in the repo. I ran `next build` in a throwaway copy of the tree in the scratchpad (no `.next`; node_modules symlinked or copied) and deleted the copy afterwards. Result: compiled successfully with types and lint, 15/15 pages. `/patients/[patientId]` first-load JS is 271 kB. react-pdf sits only in a 648 kB lazy chunk, and `document-pdf` in a separate 4 kB lazy chunk, so neither is in a route bundle. The repo's `apps/web/.next` was not touched.
**Notes:** no dev server or browser check was run (per instructions). The tester agent should run the plan's Phase 7 browser test plan (12 rows). Documents NAV roles now include front desk (Q9). When an invalid form is downloaded, focus does not move to the first error. The errors appear inline under the fields, as the plan specifies. CONVENTIONS.md follow-ups from the plan (mock DB key v12, the PDF font requirement, "documents log first, then build", the `handlers.test.ts` describe order) were not applied. They are listed as post-implementation follow-ups.

## Phase 8: Finance, shared contract and summary rules (Chunk 13) — 2026-10-03

**Steps completed:** 8.1, 8.2, 8.3
**Files changed:** `packages/shared/src/schemas/billing.ts` (optional `Invoice.appointmentId`), `packages/shared/src/schemas/finance.ts` (new), `packages/shared/src/domain/finance.ts` (new), `packages/shared/src/domain/finance.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:** none. The code is as written and needed no `!` for `noUncheckedIndexedAccess`.
**Gate:** `pnpm run check` — pass (shared 53/53, web 45/45)
**Notes:** `financeSummary` uses the runtime's local day, so NestJS must pin Asia/Manila (Issues Found, deferred).

## Phase 9: Finance, seeded billing and the report endpoint (Chunk 13) — 2026-10-03

**Steps completed:** 9.1, 9.2, 9.3
**Files changed:** `apps/web/src/mocks/{seed,db,handlers,handlers.test}.ts`, `apps/web/src/features/billing/mocks.ts`, `apps/web/src/features/dashboard/mocks.ts` (new)
**Deviations from plan:** none. The code is as written. `seedBilling(appointments, …)` runs right after the hoisted `seedAppointments` call, so no faker values change.
**Gate:** `pnpm run check` — pass (shared 53/53, web 47/47)
**Notes:** mock DB key v12 → v13. `describe("financial dashboard")` sits immediately before `describe("billing")`. Its `pay_seed_` assertion fails loudly if the describe is moved after any test that records a payment. The second test books today at 07:00 local on chair_3, so there is no clash with the seed (hours 9–16) or with the 2030 bookings.

## Phase 10: Dashboard screen (Chunk 13) — 2026-10-03

**Steps completed:** 10.1, 10.2, 10.3, 10.4, 10.5
**Files changed:** `apps/web/src/app/globals.css`, `apps/web/src/features/dashboard/api.ts` (new), `apps/web/src/features/dashboard/components/{charts,finance-dashboard}.tsx` (new), `apps/web/src/app/(clinic)/dashboard/page.tsx`, `apps/web/src/components/app-shell.tsx`
**Deviations from plan:** I loaded the ui-ux-design and dataviz skills first. The plan's code is kept, with two changes:
(1) `useFinanceSummary` sets `staleTime: 0`. The app-wide default is 30 s, and billing mutations invalidate only `billingKeys`. Without this, returning to the dashboard within 30 s of recording a payment showed stale totals, which breaks browser test row 7.
(2) The "Outstanding balances" card description reuses the tile's pluralised count, so one owing patient reads "1 patient", not "1 patients".
**Gate:** `pnpm run check` — pass (shared 53/53, web 47/47); `pnpm --filter web lint` — pass (no output). Build: the dev server (PID 81227, port 3100) uses `apps/web/.next`, so I ran `next build` in a throwaway scratchpad copy of the tree (no `.next`; node_modules symlinked) and deleted the copy afterwards. Result: compiled successfully with types and lint, 15/15 pages. `/dashboard` is 117 kB, 286 kB first load (Recharts). The repo's `apps/web/.next` was not touched.
**Notes:** dataviz validator (`#0e6b66,#a12622`, light): CVD separation, the normal-vision floor, contrast and the lightness band all pass. The chroma-floor check fails for brand teal (0.079), but that check applies only to categorical palettes, and every chart here is single-series. I kept the brand token as the plan specifies. Negative bars carry a minus sign in the tooltip and in the hidden table, so they never rely on colour alone. The app has no dark mode, so no dark-mode chart tokens were added. No dev server or browser check was run (per instructions). The tester agent should run the plan's Phase 10 browser test plan (10 rows) with a fresh v13 seed. The role gate is client-side only (Q1). The CONVENTIONS.md follow-ups (mock DB key now v13, describe-order rule, and the others from Phase 7) are still not applied.

## Post-verification fix — 2026-10-03

**Files changed:** `apps/web/src/mocks/message-templates.ts`
**Change:** the `appointment_reminder` default now names `{dentist_name}`, as Phase 3 browser row 2 expects (tester defect 1). Defect 2 (new messages not at the top of the log) is a wording error in the test plan; the send-time sort matches the plan's code and is kept.
**Gate:** `pnpm run check` — pass (shared 53/53, web 47/47)
**Notes:** templates are seeded data, so a browser already on the v13 key keeps the old wording until storage is cleared or the template is edited.

## Post-audit follow-up — 2026-10-03

**Files changed:** `CONVENTIONS.md` (Traps)
**Change:** applied the plan's Issues Found follow-up flagged by the auditor: the current mock DB key (v13), the `handlers.test.ts` describe-order rule, the PDF font and lazy-import requirement, and "documents log first, then build".
