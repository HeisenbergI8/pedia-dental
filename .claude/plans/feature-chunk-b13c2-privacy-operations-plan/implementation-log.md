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
