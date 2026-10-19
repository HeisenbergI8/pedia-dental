# Implementation log: B13c2a (privacy operations)

Branch `feature/b13c2a-privacy-operations`, from master (B1–B13c1 merged). Plan: sections 1–4 of
`feature-chunk-b13c2-privacy-operations-plan.md`; section 5 (B13c2b) is not built here.

## Phase 1: Contracts — 2026-10-19

**Steps completed:** 1.1, 1.2
**Files changed:** `packages/shared/src/schemas/privacy-operations.ts` (new), `packages/shared/src/domain/privacy-operations.ts` (new), `packages/shared/src/domain/privacy-operations.test.ts` (new), `packages/shared/src/index.ts`
**Deviations from plan:**
- `recordsCopyFileName`'s slug: the plan's `replace(/[^\w\s-]/g, "")` deletes `/` without a separator, so "Dela Cruz/Ñ" became `dela-cruzn`, while the plan's own test expects `dela-cruz-n`. The slug now strips combining marks first (Ñ → n) and turns any other run of punctuation into a word break (`replace(/[^\w-]+/g, " ")`). The test is the plan's, unchanged.
**Gate:** `pnpm run check` → exit 0 (shared 30 files / 242 tests, web 36 / 402, api 80 / 523, seed 1 / 31, infra 5 / 41). `privacy-operations.test.ts` ran directly: 4 passed.
**Notes:** the dentist expectation (`omitted: ["messages"]`) matches the matrix as measured; no matrix change.

## Phase 2: API: the copy of records — 2026-10-19

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5
**Files changed:** `apps/api/src/{chart/chart.module.ts, growth/growth.module.ts, appointments/appointments.module.ts, billing/billing.module.ts, photos/photos.module.ts, documents/documents.module.ts}` (exports), `apps/api/src/clinic/clinic.service.ts` (`name()`), `apps/api/src/records-copy/{records-copy.service.ts, records-copy.controller.ts, records-copy.module.ts, records-copy.service.test.ts, records-copy.rules.test.ts}` (new), `apps/api/src/app.module.ts`, `apps/api/test/privacy-routes.test.ts`, `apps/api/test/int/parent-ownership.int.test.ts`, `apps/api/test/int/operator-console.int.test.ts`, `apps/api/test/int/privacy-operations.int.test.ts` (new)
**Deviations from plan:**
- Module doc comments on `ChartModule` ("Exports nothing yet"), `PhotosModule` and `DocumentsModule` ("nothing imports it") were stale once they export; reworded to name `RecordsCopyModule` (itself a leaf).
- Int test: `another` is any child outside the parent's family (the plan named it without defining it; `privacy.int.test.ts`'s also requires `privacyConsent`, which the copy doesn't need). The unit test uses the seed's first signed note and its patient as fixtures (so `RecordsCopy.parse` sees a real `PatientView`).
- Confirmed before pasting (the plan's open questions): the pause value is `AccountStatus.suspended`; `GuardianView.phone` is optional.
**Gate:** `pnpm run check` → exit 0 (api 82 files / 539 tests; web 36 / 402; shared 30 / 242; seed 1 / 31; infra 5 / 41). Ran directly: `records-copy.service.test.ts` 3 passed, `records-copy.rules.test.ts` 12 passed, `privacy-routes.test.ts` 4 passed. MySQL: `vitest run --config vitest.int.config.ts test/int/privacy-operations.int.test.ts` 4 passed; `parent-ownership.int.test.ts` + `operator-console.int.test.ts` 29 passed.
**Notes:** the export's ownership is proven by the parent-ownership sweep now that `NOT_SERVED` is gone.

## Phase 3: API: the audit-log reader — 2026-10-19

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** `apps/api/src/audit/audit.service.ts` (`page`), `apps/api/src/patients/patients.service.ts` (`namesOf`), `apps/api/src/audit-log/{audit-log.controller.ts, audit-log.module.ts}` (new), `apps/api/src/app.module.ts`, `apps/api/test/privacy-routes.test.ts` (`PRIVACY_ROUTES`, retitled), `apps/api/test/int/operator-console.int.test.ts` (`noController` removed: every clinic rule swept), `apps/api/test/int/privacy-operations.int.test.ts`
**Deviations from plan:** none. The plan's suggested direct tenancy proof (`every entry's clinicId is the demo clinic`) is in the first case.
**Gate:** `pnpm run check` → exit 0 (api 82 files / 540 tests; web 36 / 402; shared 30 / 242; seed 1 / 31; infra 5 / 41). `privacy-routes.test.ts` 5 passed. MySQL: `privacy-operations.int.test.ts` + `operator-console.int.test.ts` 16 passed; full `pnpm --filter api test:int` → 54 files / 615 tests passed.
**Notes:** the name join stays in the controller (plan Q8 default). The API writes "Audit log" after the read, MSW's gate before it; no test asserts the first row.

## Phase 4: MSW: the handlers, `API_ROUTES` and the web's cases — 2026-10-19

**Steps completed:** 4.1, 4.2, 4.3, 4.4
**Files changed:** `apps/web/src/features/patients/mocks.ts` (`visibleTo` exported), `apps/web/src/features/patients/export-mocks.ts` (new), `apps/web/src/features/audit/mocks.ts` (new), `apps/web/src/mocks/handlers.ts`, `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`, `apps/web/src/mocks/privacy.test.ts`
**Deviations from plan:**
- Web twins (Step 4.4): the parent's account id is `guardian.<patient_sibling's first guardian id>`, read from the seeded tenant as the file's "parent consent" block already does (the plan's placeholder; there is no helper in `portal.test.ts`). Two assertions added so each twin checks what its API case checks: the parent's photos are their own uploads, and the first page is newest first; the child's name is compared exactly. Titles are the API's, character for character (the port ledger passes with no new line).
- The describe goes last in `privacy.test.ts`: the cases only add rows, and the earlier "notices" block restores what it changes.
**Gate:** `pnpm run check` → exit 0 (web 36 files / 407 tests, +5; api 82 / 540; shared 30 / 242; seed 1 / 31; infra 5 / 41). Ran directly: `privacy.test.ts` 17 passed, `passthrough.test.ts` 7 passed, `port-ledger.test.ts` 16 passed.
**Notes:** `mock-db` key unchanged (no `Db` or seed change). The passthrough sweep now expects no rule left unserved.

## Phase 5: Web screens — 2026-10-19

**Steps completed:** 5.1, 5.2, 5.3 (the `ui-ux-design` skill and its `interaction-patterns.md` loaded first)
**Files changed:** `apps/web/src/lib/save-file.ts` (new), `apps/web/src/features/documents/download.ts` (uses `saveFile`), `apps/web/src/features/patients/api.ts` (`useRecordsCopy`), `apps/web/src/features/patients/components/records-copy-button.tsx` (new), `privacy-card.tsx`, `apps/web/src/features/portal/components/portal-privacy.tsx`, `apps/web/src/features/audit/api.ts` (new, `useInfiniteQuery`: the flagged new pattern), `apps/web/src/features/audit/components/audit-log.tsx` (new), `apps/web/src/features/clinic/components/settings-screen.tsx` (Privacy tab; the page description names the audit log)
**Deviations from plan:**
- `RecordsCopyButton` keeps its label while pending and swaps the icon for a spinner (the skill's feedback table: "label kept"), instead of the plan's label change to "Preparing the copy…"; and a brief success toast, as the document download button gives.
- Audit log rows with no child show an empty Child cell rather than "—": on phones the card's meta line otherwise ended in " · —" (noise, severity 1); `MetaLine` drops a `null`.
- The audit log sits in a `SectionCard` ("Audit log") inside the tab, with a short description saying that opening it is logged; the count reads "Showing the latest N entries" while older ones exist and "Showing all N entries" at the end (no total: decisions.md E8).
- `settings.test.ts` asserts no tab list, so it needed no change.
**Gate:** `pnpm run check` → exit 0 (web 36 files / 407 tests; api 82 / 540; shared 30 / 242; seed 1 / 31; infra 5 / 41). `pnpm run check -- design` → web 6 files / 100 tests. Looked at it in Chromium against the MSW app (`NEXT_PUBLIC_API_MOCKING=enabled`, own dist dir; `tsconfig.json` reverted after): Settings → Privacy at 1440 / 1280 / 768 / 375 (no horizontal page scroll at any width), the Refused filter (URL `?tab=privacy&action=denied`, Clear filters), the staff Privacy card at 1440 / 768 / 375 and the portal at 375 / 1280; both buttons downloaded `records-lynch-*-2026-10-19.json`; the portal button is 44 px tall.
**Design notes (per screen):**
- Settings → Privacy: fixed the phone meta-line "—" (above). Left: on a phone the five-option filter strip scrolls with the edge fade and "Refused" starts partly hidden (the same scrolling strip the Settings tabs use; severity 1). "Refused" carries the shield icon and its label in the danger colour (never colour alone). "Load older" wasn't seen in the browser: MSW's seeded trail has 29 entries (< 50); the paging is covered by both twins' tests.
- Staff Privacy card: the button sits under a rule after the consent block, shown with or without consent; the patient header stays pinned.
- Portal: the button is outside `<Can consents.manage>` (a paused clinic's parent may still download), 44 px.
- Not verified visually: dark mode and 200 % zoom (tokens only; the design guards pass; 768 px is the nearest width checked). Keyboard: every control is a native button, link or Radix Select.
