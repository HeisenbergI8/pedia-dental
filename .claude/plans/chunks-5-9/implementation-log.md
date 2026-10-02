# Implementation log: ROADMAP Chunks 5–9

No architect plan exists for this work; the plan is `ROADMAP.md` Part 2, Chunks 5–9. Each chunk's
"Done when" is its acceptance check. Baseline before Phase 5 (2026-10-02): `pnpm run check` green
(shared 12/12, web 10/10).

## Phase 5: Dental chart, display (Chunk 5) — 2026-10-02

**Steps completed:** SVG tooth with 5 clickable surface zones (incisal for anterior teeth); paper-chart
layout (4 quadrants, primary rows under permanent incisors/canines, primary / mixed / permanent toggle);
conditions rendered from `deriveChart()` with a legend.
**Files changed:** `apps/web/src/mocks/{seed,db,handlers}.ts`, `apps/web/src/features/chart/{api,mocks}.ts`,
`apps/web/src/features/chart/components/{tooth,dental-chart,chart-tab}.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- Colour is never the only signal: every condition also has a short code printed under the tooth
  (C, R, Se, F, PO, PE, X, M, UE, E), and sealant / fluoride / pulpotomy use stripe, dot and bar patterns.
  Extracted and missing draw a cross; unerupted and erupting draw a dashed outline.
- Surface placement follows the paper chart viewed from the front: upper teeth show buccal on top,
  lower teeth lingual on top; mesial faces the midline.
- The starting mode comes from age (under 6 primary, 6–12 mixed, 13+ permanent); staff can switch.
- Below ~34rem the chart scrolls sideways inside its card rather than shrinking teeth to ~14px.
- Each tooth is one `<button>` (Tab-focusable, `aria-label` describes its findings). Clicking a zone
  reports the surface; keyboard activation selects the whole tooth. Nothing acts on it until Phase 6.
- Seeded 2–5 findings at each patient's first visit (age-appropriate teeth), and restorations of some
  caries at a later visit. Mock DB key bumped to `v3`.
**Gate:** `pnpm run typecheck` — green. `vitest run src/mocks/handlers.test.ts` — 9/9. `eslint` — clean.
**Notes:** Browser check (Playwright, dev server on :3100 because :3000 is another project): modes
show 20 / 52 / 32 teeth; a 14-year-old opens in permanent mode with 12-I restored, 24-B caries,
27-O restored; a mixed-dentition child shows 64-O sealant, 83-L caries, 32-I+D caries; Tab moves
tooth to tooth; no page-level horizontal scroll at 390px; no console errors.

## Phase 6: Dental chart, editing and history (Chunk 6) — 2026-10-03

**Steps completed:** tooth panel (surfaces, condition, note → chart entry for the current visit);
corrections as superseding entries; per-tooth history; "chart as of visit" selector.
**Files changed:** `packages/shared/src/schemas/chart.ts`, `packages/shared/src/domain/{chart,chart.test}.ts`,
`apps/web/src/features/chart/{api,mocks}.ts`, `apps/web/src/features/chart/components/{tooth-panel,chart-tab}.tsx`,
`apps/web/src/features/visits/mocks.ts`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- **`deriveChart` bug fixed.** It applied a correction at the time it was *recorded*, so correcting a
  visit-1 finding during visit 3 overwrote visit 2's restoration. A correction now applies at the time
  of the entry it supersedes (following the chain). Regression test added; history order is unchanged.
- `CreateChartEntryInput` (shared) rejects surfaces on whole-tooth conditions (`WHOLE_TOOTH_CONDITIONS`:
  pulpotomy, pulpectomy, extracted, missing, unerupted, erupting). The panel disables surfaces for them.
- `POST /patients/:id/chart` rules: visit must belong to the patient and be in progress (409), surfaces
  must exist on the tooth (400), a correction must target an entry on the same tooth (400) that has not
  already been corrected (409). `recordedBy` is the visit's dentist, set server-side.
- "As of visit X" shows only entries from visits up to X; corrections made later are excluded, so it is
  the chart as it was known then. A past chart is read-only.
- **Chunk 4 bug fixed:** `visits/mocks.ts` dated new visits with the UTC day (`toISOString()`), so in
  Manila any visit before 08:00 got yesterday's date. Now uses the local calendar day.
**Gate:** `pnpm run typecheck` — green. Tests: shared 13/13, web 13/13. `eslint` — clean.
**Notes:** Browser check (Playwright, 11 checks, all passing): panel read-only with no visit; clicking
74's centre zone pre-checks Occlusal; caries saved in visit 1, restored in visit 2, history lists both;
"Extracted" disables surfaces; correcting the restoration appends a "Correction" and marks the original
"Corrected"; "as of" visit 1 shows caries and is read-only; Enter on a focused tooth opens the panel;
survives refresh.

## Phase 7: Clinical notes + behavior tracking (Chunk 7) — 2026-10-03

**Steps completed:** template renderer that builds a form from `NoteTemplate.fields`; all 11 templates
seeded (oral exam mirrors the paper chart); behavior multi-select + note in every note; trend strip on
Overview; signing locks a note.
**Files changed:** `packages/shared/src/schemas/notes.ts`, `packages/shared/src/domain/{notes,notes.test}.ts`,
`packages/shared/src/index.ts`, `apps/web/src/mocks/{note-templates,seed,db,handlers}.ts`,
`apps/web/src/features/notes/{api,mocks}.ts`,
`apps/web/src/features/notes/components/{note-dialog,notes-tab,behavior-trend}.tsx`,
`apps/web/src/features/chart/components/tooth-picker.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- `TemplateField` gained `required`; `ClinicalNote` gained `behaviorNote` (the roadmap's "short note")
  and `createdAt` (ordering). `noteValuesSchema(template)` in shared builds the Zod schema from a
  template; the note form and the mock both validate with it, and unknown keys are dropped.
- The roadmap says "oral examination template mirrors the paper chart". Gingivitis and plaque use the
  spec's Mild / Moderate / Severe and are optional (blank = none observed).
- Templates live in `mocks/note-templates.ts` and are served by `GET /note-templates`; there is no
  template for `follow_up` (no procedure-specific fields), so 11 templates for 12 catalog procedures.
- Notes are created only during a visit in progress (409). Drafts can be edited and signed after the
  visit ends, since dentists often finish notes later. Required fields are enforced on every save.
- The "teeth" field uses `ToothPicker`, which is Chunk 6's `DentalChart` in selection mode.
- Every seeded past visit has a signed oral exam with 1–2 behavior ratings. Mock DB key bumped to `v4`.
**Gate:** `pnpm run typecheck` — green. Tests: shared 16/16, web 16/16. `eslint` — clean.
**Notes:** Browser check (Playwright): 11 templates offered; oral exam shows all paper-chart fields;
Save and sign with nothing filled shows "Pick at least one tooth" and "Choose one"; pulpotomy on 84
with MTA and Anxious saved as a draft, reopened with its values, signed; the signed card shows "Signed"
and has no edit control; `PUT` on it returns 409 (handler test); the trend strip shows the new visit's
behavior and note last.

## Phase 8: Growth and development (Chunk 8) — 2026-10-03

**Steps completed:** per-visit record of habits (started / stopped dates) and speech observations;
dentition stage and eruption status read from the chart; timeline on the Overview tab.
**Files changed:** `packages/shared/src/schemas/growth.ts`, `packages/shared/src/domain/{growth,growth.test}.ts`,
`packages/shared/src/index.ts`, `apps/web/src/mocks/{db,seed,handlers}.ts`,
`apps/web/src/features/growth/{api,mocks}.ts`, `apps/web/src/features/growth/components/growth-card.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- Habits are the four the spec lists (thumb sucking, pacifier, mouth breathing, bruxism); speech is a
  free-text observation, not a habit.
- One `GrowthRecord` per visit; `PUT /visits/:id/growth` creates or replaces it (409 once the visit is
  completed). A stop date before the start date is rejected by the shared schema.
- `habitTimeline()` (shared) merges records oldest first: a later record's dates win, but a start
  date isn't lost when a later visit only adds the stop date. The form carries forward what earlier
  visits recorded, so staff update rather than retype.
- `dentitionStage()` (shared) reads only charted teeth. Uncharted teeth are not guessed from age, so
  a patient with no chart shows "Dentition stage not charted yet".
- Nothing seeded: realistic demo data belongs to Chunk 18. Mock DB key bumped to `v5`.
**Gate:** `pnpm run typecheck` — green. Tests: shared 19/19, web 18/18. `eslint` — clean.
**Notes:** Browser check (Playwright, 13 checks, all passing): stage "Mixed dentition" from the chart;
no record button without a visit; thumb sucking since 2023-06-01 recorded in visit 1 shows "Ongoing";
visit 2's form carries it forward; a stop date before the start is rejected; stopping it on
2026-09-20 shows "since Jun 1, 2023 → stopped Sep 20, 2026 · Stopped", and the timeline lists visit 2
(stopped, speech) above visit 1 (ongoing).

## Phase 9: Treatment plan and progress (Chunk 9) — 2026-10-03

**Steps completed:** plan items from the procedure catalog, optionally per tooth, with a fee; "Add to
plan" from a chart finding; items complete when a matching note is signed; progress bar.
**Files changed:** `packages/shared/src/schemas/plan.ts`, `packages/shared/src/domain/{plan,plan.test}.ts`,
`packages/shared/src/index.ts`, `apps/web/src/mocks/{db,seed,handlers}.ts`,
`apps/web/src/features/plan/{api,mocks}.ts`, `apps/web/src/features/plan/components/{plan-tab,add-to-plan}.tsx`,
`apps/web/src/features/notes/{api,mocks}.ts`, `apps/web/src/features/chart/components/tooth-panel.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:**
- A plan is the patient's list of `PlanItem`s; there is no separate plan entity (the spec describes a
  plan as "a list of planned items").
- `itemsCompletedBy(procedure, teeth, items)` (shared): a signed note completes one open item per tooth
  it treated, or else the oldest open item for that procedure with no tooth. `POST /notes/:id/sign`
  applies it and records `completedVisitId` / `completedNoteId`. A draft completes nothing.
- `done` can't be set by hand: `PATCH /plan-items/:id` accepts planned / in_progress / declined only
  (400 for done) and returns 409 once an item is done. The UI checkbox is a read-only indicator.
- Declined items are excluded from progress and from the total fee (`planProgress()`).
- Per-tooth procedures (`Procedure.perTooth`) require a tooth (400). The fee defaults from the catalog
  and can be changed per item.
- "Add to plan" lives in the tooth panel, suggests a procedure from the tooth's latest finding
  (caries → restoration), lists what is already planned for that tooth, and links the item to that
  finding (`sourceChartEntryId`).
- Seeded the spec's example plan on one patient aged 4–8 with ≥2 visits: caries on 51-M, 74-O, 84-O at
  the earlier visit; prophylaxis, fluoride and a restoration of 51 signed at the latest, so 3 of 6 done
  and the total is ₱8,500. Mock DB key bumped to `v6`.
**Gate:** `pnpm run check` — green (shared 23/23, web 20/20). `eslint` — clean.
**Notes:** Browser check (Playwright, 18 checks, all passing): the seeded patient's Plan tab reads
"3 of 6 done", progressbar 3/6, total ₱8,500.00, done items name the completing note, and no checkbox
can be ticked; tooth 74's panel lists its planned restoration; "Add to plan" on 85 adds a pulpotomy
(3 of 7); signing a restoration note on 74 makes it 4 of 7 and links the item to the note; declining
the follow-up gives 4 of 6 and drops it from the total; the add form prefills the catalog fee and
rejects tooth 19. The intermittent console 404 seen in earlier phases is webpack's
`*.hot-update.json` during dev hot reload, not the app.

## Not implemented / left for later chunks (2026-10-03)

- No role gating on recording findings, notes or plan changes: the role switcher is a demo control,
  and the mock can't know the role. Any staff role can currently record.
- Optional note selects can't be cleared once chosen (Radix Select has no empty item); pick another value.
- Two visits started within the same minute still get identical "as of" labels.
- No cross-visit habit check: a stop date isn't compared with a start date recorded at an earlier visit
  beyond what the form carries forward (it pre-fills the earlier start, so the stop-before-start rule applies).
- Growth records are not seeded; demo data is Chunk 18's job.
- Follow-up due items on signing (Chunk 11) and billing from done items (Chunk 12) are not started.

## Phase 10: Fixes from the audit and test reports — 2026-10-03

**Source:** the auditor report (score 73/100) and the tester report, both run against Chunks 5–9.
**Fixed:**
1. *Follow-up plan items could never complete* (auditor, medium). Added a 12th template, `tpl_follow_up`
   (teeth reviewed, healing, symptoms, next steps). The handler test now asserts exactly one template per
   catalog procedure, and a new test completes a follow-up item by signing the note. This replaces the
   Phase 7 deviation "no template for `follow_up`".
2. *Note dialog clipped at 390px* (tester, medium). The dialog content is a grid, and both a grid item and a
   `<fieldset>` default to min-content width, so the tooth picker stretched it. Added `min-w-0` to the form
   and the teeth fieldset.
3. *Findings accepted on an extracted or missing tooth* (tester). New shared `isToothGone()`;
   `POST /patients/:id/chart` returns 409 unless the entry is a correction. The panel replaces the form
   with a message, still offers Correct, and hides Add to plan.
4. *Focus lost when the tooth panel closes* (tester, a11y). Focus returns to the tooth (`data-tooth`).
5. *Behavior trend counted drafts* (auditor). Only signed notes count.
6. *Add to plan active in a past chart* (auditor). Hidden when "Chart as of" is not Latest.
7. *Same-day visits looked identical in "Chart as of"* (tester). A start time is added when two visits share a date.
8. *Habit dates* (tester). Future dates are rejected in the shared schema (and `max` on the inputs). Errors now
   show inline under the habit, not as a toast. A stop date without a start date stays allowed: parents
   often know when a habit stopped but not when it began.
9. *Raw JSON in 400 errors* (auditor). `api-client` turns a Zod-issues body into its messages.
**Not changed:** quadrant numbers as literals in `tooth.tsx` (not tooth lists; a helper would have one
caller); signing a note with no behavior or with teeth that have no plan item (allowed by design).
**Files changed:** `packages/shared/src/domain/{chart,chart.test,growth.test}.ts`, `packages/shared/src/schemas/growth.ts`,
`apps/web/src/mocks/{note-templates,db,handlers.test}.ts`, `apps/web/src/lib/api-client.ts`,
`apps/web/src/features/chart/mocks.ts`, `apps/web/src/features/chart/components/{tooth,tooth-panel,chart-tab}.tsx`,
`apps/web/src/features/notes/components/{note-dialog,behavior-trend}.tsx`,
`apps/web/src/features/growth/components/growth-card.tsx`. Mock DB key bumped to `v7`.
**Gate:** `pnpm run check` — exit 0 (shared 25/25, web 22/22). `pnpm --filter web lint` — exit 0.
**Notes:** Browser check (Playwright, 17 checks): 16 passed on the first run. The same-day label check
failed because the script opened the list before visits refetched; a re-run with a wait showed
"Visit of Oct 3, 2026, 12:52 AM (current)" and "Visit of Oct 3, 2026, 12:52 AM". A follow-up note takes the
example plan to 4 of 6; drafts stay out of the trend until signed; an extracted 85 offers only Correct and
focus returns to it on Escape; the past chart hides Add to plan; a 2099 habit date errors inline; the
Pulpotomy note dialog fits at 390px (scrollWidth 356 = clientWidth 356) with no console errors.
