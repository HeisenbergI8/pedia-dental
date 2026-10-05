# Implementation log: form friction

User confirmed all recommended defaults D1–D11 on 2026-10-05, including: an allergy answer is required when editing old records, phone booking stays a Dialog, fees use `formatPeso`.

**Environment note:** `/opt/homebrew/opt/node@22/bin/node` (first on PATH) fails to start: it links `libsimdjson.33.dylib`, and Homebrew now links simdjson 5.0.2. Every gate below ran with `PATH=/opt/homebrew/bin:$PATH` (Node v26.10.0). Homebrew was not changed.

## Phase 1: Kit — 2026-10-05

**Steps completed:** 1.1, 1.2, 1.3, 1.4, 1.5
**Files changed:** `apps/web/src/components/form-field.tsx`, `apps/web/src/components/choice-chips.tsx` (new), `apps/web/src/components/choice-chips.test.ts` (new), `apps/web/src/components/optional-section.tsx` (new), `apps/web/src/components/optional-section.test.ts` (new), `apps/web/src/components/ui/combobox.tsx` (new), `apps/web/src/components/ui/combobox.test.ts` (new), `apps/web/src/features/patients/components/tag-input.tsx`, `apps/web/src/design/design-primitives.test.ts`
**Deviations from plan:**
- In the plan's test code, `children` is passed as a prop (`h(X, { ..., children })`) rather than as the third `createElement` argument. TS requires `children` in the props object when the prop type marks it required.
- The TagInput suggestion row is `role="group"` with an `aria-label`. A bare `div` with `aria-label` is not announced.
**Gate:** `pnpm run typecheck` green. `vitest run` on the 4 Phase 1 test files: 16 passed. `pnpm run check -- design`: 96 passed.
**Notes:** The Combobox's behaviour inside a Dialog (focus, Escape, outside click) is not covered by the SSR tests. It needs a hand check in Phase 3.

## Phase 2: Smart defaults and bug fixes — 2026-10-05

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
**Files changed:** `packages/shared/src/domain/appointments.ts`, `packages/shared/src/domain/appointments.test.ts`, `apps/web/src/features/visits/api.ts`, `apps/web/src/features/appointments/components/appointment-form.tsx`, `apps/web/src/features/visits/components/visit-banner.tsx`, `apps/web/src/features/billing/components/payment-dialog.tsx`, `apps/web/src/features/billing/components/apply-credit-dialog.tsx`, `apps/web/src/features/documents/components/documents-tab.tsx`, `apps/web/src/features/documents/content.test.ts`, `apps/web/src/features/notes/components/note-dialog.tsx`, `apps/web/src/features/patients/components/consent-dialog.tsx`
**Deviations from plan:**
- 2.4: `by` is written as `receivedBy || (staff.find(me) ?? staff.find(front_desk))?.id || ""`, not the plan's ternary with a non-null `myId!`. The behaviour is the same, and there's no non-null assertion.
- 2.5: the `initialDraft` doc comment is extended to describe the new defaults.
**Gate:** `pnpm run typecheck` green. `vitest run src/domain/appointments.test.ts` (shared): 21 passed. `vitest run src/features/documents/content.test.ts` (web): 9 passed.
**Notes:** Steps 2.3 (split Start-visit button), 2.6 (note template suggestion) and 2.7 (consent date on open) have no mechanical check and need a hand look. 2.3: sign in as dentist@gmail.com and as admin@gmail.com.

## Phase 3: Book appointment redesign — 2026-10-05

**Steps completed:** 3.1, 3.2, 3.3, 3.4
**Files changed:** `packages/shared/src/domain/appointments.ts`, `packages/shared/src/domain/appointments.test.ts`, `apps/web/src/features/appointments/booking.ts` (new), `apps/web/src/features/appointments/booking.test.ts` (new), `apps/web/src/features/appointments/components/booking-pickers.tsx` (new), `apps/web/src/features/appointments/components/appointment-form.tsx`, `apps/web/src/features/patients/api.ts`
**Deviations from plan:**
- `booking.ts` gains `whenLabel` ("today, 2:45 PM"). `bookLabel` is `Book ${whenLabel}`. Slot cards use `whenLabel` instead of `bookLabel(...).replace(/^Book /, "")`.
- `COMMON_PROCEDURES` is typed `readonly string[]`, not `as const`, so `.includes(p.code)` typechecks without a cast.
- No extra footer classes: the kit's `DialogFooter` is already `sticky -bottom-6 … max-sm:pb-[safe-area]`, which is the D6 sticky Book bar.
- `usePatient` gets `enabled: !!id`. The pickers call it before a patient is chosen, and `""` would request `/patients/`. This is the same pattern as `useVisits` in 2.2.
- `SelectField` moved from `appointment-form.tsx` into `booking-pickers.tsx` (it's exported, and reschedule uses it). Date/time/minutes/chair became `TimeFields`, shared by "Pick another date or time" and reschedule.
- `FormValues` is exported as `type BookingValues` for the pickers (type-only import, so no runtime cycle).
- The selected-patient card is plain markup with a text label, not wrapped in `FormField`. FormField's control props would have put `aria-invalid` on a `div`.
- When a dentist has no slot in 14 days, the form shows a line and `TimeFields` automatically (`noSlots`), without setting `custom`. Picking another dentist then returns to slot cards.
**Gate:** `pnpm run typecheck` green. `vitest run src/domain/appointments.test.ts` (shared): 23 passed (the existing `findFreeSlot` tests unchanged). `vitest run src/features/appointments src/design` (web): 99 passed. `eslint` on the touched folders: clean.
**Notes:** Needs a hand check:
- the combobox inside the Dialog (Escape closes the list and not the dialog; clicking an option keeps the dialog open; arrow keys and Enter);
- slots following the dentist and the procedure length;
- the 375 px full-screen dialog with its sticky Book bar;
- the calendar "New appointment" button with `?date=` opening at 8:00 AM (or the next open slot), no longer 00:00.

## Phase 4: New patient, schema and required core — 2026-10-05

**Steps completed:** 4.1, 4.2, 4.3, 4.4, 4.5
**Files changed:** `packages/shared/src/schemas/patient.ts`, `apps/web/src/mocks/handlers.test.ts`, `apps/web/src/mocks/seed.ts`, `apps/web/src/mocks/seed.test.ts`, `apps/web/src/mocks/db.ts` (key v23), `CONVENTIONS.md` (key v22 → v23), `apps/web/src/features/patients/components/patient-header.tsx`, `apps/web/src/features/patients/components/patient-overview.tsx`, `apps/web/src/features/patients/intake.ts` (new), `apps/web/src/features/patients/intake.test.ts` (new), `apps/web/src/features/patients/components/patient-form.tsx`
**Deviations from plan:**
- 4.4: `requiredProgress` takes a small local `IntakeValues` type instead of importing `PatientFormDraft` from the form, so `intake.ts` has no dependency on a component. `splitName` uses `words[words.length - 1]` rather than `.at(-1)!`, avoiding a non-null assertion.
- 4.5, guardian surname prefill: an effect on `lastName` writes the surname into `guardians.0.fullName` only while that field is empty or still equals the previous surname. This replaces "in create mode while `!isDirty`". It is safe in edit mode (a real name is never replaced) and needs no `intake` prop before Phase 5. On focus, the copied surname gets a leading space and the caret goes to the start, so typing the first name reads "Maria Dela Rosa". `intakeRules` still refuses a name that is only the surname.
- 4.5, card title: "Guardian" (description "The primary contact gets reminders and signs consents.") instead of "Primary guardian", because an extra guardian can be made primary. The first guardian's Primary contact checkbox appears only when there's more than one guardian.
- 4.5, sections not yet redesigned: in the interim they are grouped as "Other details" (address, school, referred by, tags), "Other guardians" (first guardian's email, extra guardians, Add guardian), "Emergency contact", "More medical" and "Previous dental history". Phase 5 turns them into OptionalSections.
- 4.5: `PrimaryBox` is a render function (`primaryBox(i, id)`), not a component declared inside render, which would remount on every render.
- 4.5: the four dental-history textareas are rendered from one typed list instead of four copies.
**Gate:** `pnpm run typecheck` green. `pnpm run check`: shared 134 passed, web 225 passed. `eslint src/features/patients src/components`: clean.
**Notes:** Seed key bumped, so the demo reseeds on next load. Every 10th seeded patient (i % 10 === 7) shows "Allergies not asked yet". Editing such a patient now requires an allergy answer (D1, confirmed).

## Phase 5: Optional sections, progress rail, sticky bar, Save and book — 2026-10-05

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/web/src/features/patients/components/patient-form.tsx`, `apps/web/src/features/patients/api.ts`, `apps/web/src/features/patients/components/intake-progress.tsx` (new), `apps/web/src/features/patients/components/patient-editors.tsx`, `apps/web/src/features/appointments/components/patient-appointments.tsx`
**Deviations from plan:**
- 5.1: in `hideContacts` mode (a dentist editing), the extra guardians stay editable in a plain "Other guardians" Section with the explanatory line, instead of disappearing with the Contact section. This keeps today's ability to edit an extra guardian's name and relationship.
- 5.1: the emergency fields are labelled "Emergency contact name" and "Emergency contact phone", because they now sit inside "Contact and address" without their own heading. "Add guardian" reads "Add another guardian".
- 5.2: `DuplicateStatus` takes `{ firstName?, lastName?, birthDate? }`, not `Partial<PatientFormDraft>`. RHF's deep-partial watch type isn't assignable to `Partial`.
- 5.2: the pills variant shows a compact duplicate pill ("No existing match" / "May already be registered"), as in the approved tablet board. With no names yet, it shows nothing.
- 5.3: the create page's description is now "The essentials first. Everything under Add now or later can wait for the first visit." ("Fields are required unless marked optional" no longer describes the page.) The submit label is "Save patient".
- 5.3: the submit-time duplicate check uses a local `checking` state around `qc.fetchQuery`, so the buttons disable while it runs. There is no mutation's `isPending` to read any more.
**Gate:** `pnpm run typecheck` green. `pnpm run check`: shared 134 passed, web 225 passed. All 14 web test files run, including the 5 new ones (verified with `--reporter=verbose`). `eslint src/features/patients src/features/appointments src/components`: clean.
**Notes:** Unverified: `useSearchParams` in `PatientAppointments` under `next build` (the plan's Suspense question). Check it with `pnpm build` before merging.

## Phase 6: Draft autosave and unsaved-changes guard — 2026-10-05

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `apps/web/src/lib/form-draft.ts` (new), `apps/web/src/lib/form-draft.test.ts` (new), `apps/web/src/stores/session-store.ts`, `apps/web/src/features/patients/components/patient-editors.tsx`, `apps/web/src/features/patients/components/patient-form.tsx`
**Deviations from plan:**
- 6.1: `clearAllDrafts` loops `sessionStorage.length` / `key(i)` instead of `Object.keys(sessionStorage)` (the option the plan's note offered), so the Map-backed test stub and real Storage behave alike.
- 6.3: a new PatientForm prop `restored` makes Cancel ask before discarding a restored draft even when nothing has changed since. `isDirty` is false right after a restore, because the draft is the defaults.
- 6.3: `EMPTY` is exported as `EMPTY_PATIENT` so CreatePatient can build `blank()` (EMPTY plus the `?name` split).
- 6.3: the guardian surname effect now skips a `setValue` that wouldn't change anything. Without this, opening an untouched form fires the watcher and autosaves an empty draft, which would show "We kept what you typed earlier" for nothing.
- Hydration: reading sessionStorage in a `useState` initialiser is safe because `RequireSession` renders the clinic pages only after the persisted session hydrates on the client (server snapshot `false` → LoadingScreen).
**Gate:** `pnpm run typecheck` green. `pnpm run check` (closing gate): shared 134 passed, web 228 passed (15 files). `eslint src/features src/components src/lib src/stores src/mocks`: 0 errors, 1 warning in `features/auth/api.ts` (unused `LogoutInput`), a file this branch does not touch. `pnpm build`: succeeds, `/patients/new` prerenders as static, which answers the Phase 5 `useSearchParams` / Suspense question.
**Notes:** In-app navigation away from New patient isn't blocked (no App Router API). The draft survives it, and only closing the tab warns.

## Not implemented / open

- Every plan step is implemented. None was skipped.
- Hand checks still owed:
  - Combobox inside the Dialog (Escape, outside click, arrow keys, Enter) at 375 and 1280 px.
  - Slots following the dentist and the procedure length.
  - The 2.3 split Start-visit button, as dentist@gmail.com and as admin@gmail.com.
  - 2.6 note template suggestion.
  - 2.7 consent date on open.
  - New patient restore → Start over → Discard flow.
  - The beforeunload prompt.
- Deferred by the plan (Follow Ups): moving the 7 hand-rolled `useState` forms onto RHF and FormField, and "none" wording for allergies in the portal, tooth panel and documents.

## Post-verification fixes — 2026-10-05

After the tester's report and the audit (the audit confirmed all 27 steps were delivered, confidence 74/100), the user asked for fixes, a commit and a merge.

**Fixes:**
1. Audit finding 1: extra guardians moved out of the "Contact and address" OptionalSection into the Guardian card, with an "Add another guardian" link, as the approved canvas shows. Before this, a second guardian (or its errors) could be hidden in a collapsed section whose `fields` didn't count them. In `hideContacts` mode the explanatory line moved into the Guardian card, and the interim "Other guardians" Section is gone.
2. Tester note 1 / audit finding 2: the cause is confirmed. zod 4 skips refinements after a field fails its type check (an unpicked `sex` is `undefined`). It was verified in isolation: `{ a: "", sex: undefined }` gives `[a, sex]` with no refinement issues. `intakeRules` now runs with `{ when: () => true }` and reads values defensively, so one Save lists the medical questions alongside the other missing fields.
3. Tester note 3: a full name pasted or filled at the caret before the copied surname ("Rosa Cruz Cruz") is collapsed back to "Rosa Cruz" on change.
4. Tester note 4: "Save and book appointment" and "Start visit as …" wrap their label in one span, so the button's flex `gap` no longer splits the words. The `&nbsp;` was removed.

**Small changes not recorded in the earlier phase entries (from the audit), all intended:**
- The `intakeRules` surname guard skips the check when there's no surname.
- `ageHint` shows only for a whole, past birth date.
- `bookedIds` is sorted by `startsAt` so "booked soonest first" holds.
- The two-list medical answer has a "Fill in at least one" hint.
- The `DentistPicker` prop is named `childName`.
- `ProcedurePicker` sets `procedureCode` without `shouldValidate`.
- The tablet pills say done or to do for screen readers only; the icon shape carries it visibly.

**Left as is:** the note-template suggestion only fires for visits started from an appointment (Step 2.6 keys on `visit.appointmentId`, and patient-page visits carry none). Linking those visits is a separate change.
**Gate:** `pnpm run check`: shared 134 passed, web 228 passed. `eslint src/features/patients src/features/visits`: clean.
