# Implementation log: ROADMAP Chunks 10 and 15

No architect plan exists for this work; the plan is `ROADMAP.md` Part 2, Chunks 10 and 15. Each chunk's
"Done when" is its acceptance check. Built on branch `chunks-10-15` in the worktree
`.claude/worktrees/chunks-10-15`, branched from `bab75e9`, in parallel with Chunks 5–9 on `master`.
Baseline before Phase 10 (2026-10-02): `pnpm run check` green (shared 12/12, web 10/10).

**Merge notes for master (Chunks 5–9 run in parallel):** both tracks edit `mocks/{db,seed,handlers}.ts`,
`mocks/handlers.test.ts` and `patients/components/patient-record.tsx`. Keep both sides' collections,
handlers and tabs. Both tracks bumped the mock DB key (Chunk 5 → `v3`, this branch → `v4`). After the
merge, bump it once more so browsers holding either shape reseed.

## Phase 10: Appointments (Chunk 10) — 2026-10-03

**Steps completed:** day view with one column per chair, plus week and month views; book, reschedule
(drag, resize, or the edit form), cancel with a reason; status flow; double-booking checks in the mock
handler; no-show count on the patient profile; "Start visit" from an arrived appointment.
**Files changed:** `packages/shared/src/schemas/appointment.ts`, `packages/shared/src/domain/appointments{,.test}.ts`,
`packages/shared/src/index.ts`, `apps/web/src/mocks/{db,seed,handlers,handlers.test}.ts`,
`apps/web/src/features/appointments/{api,mocks}.ts`,
`apps/web/src/features/appointments/components/{appointment-calendar,appointment-form,appointment-sheet,patient-appointments}.tsx`,
`apps/web/src/features/visits/{api,mocks}.ts`, `apps/web/src/features/patients/components/patient-record.tsx`,
`apps/web/src/app/(clinic)/appointments/page.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/app/globals.css`.
**Deviations from plan:**
- The status flow and the double-booking rule live in `@pedia/shared` (`canTransition`, `canReschedule`,
  `findConflict`), not inline in the handler, so NestJS imports the same rule instead of copying it.
- `in_chair` and `done` can't be set by hand. Starting a visit with `appointmentId` moves an arrived
  appointment to `in_chair` (409 if it hasn't checked in); finishing that visit moves it to `done`.
  `POST /appointments/:id/status` accepts only confirmed, arrived, no_show and cancelled.
- `Appointment` gained `cancelReason`; cancelling without one is a 400.
- Booked → arrived is allowed without confirming first (walk-ins and same-day calls).
- Cancelled and no-show appointments free their slot. Cancelled ones are hidden from the calendar but
  still count on the patient; no-shows stay on the calendar, struck through.
- Only booked and confirmed appointments can be moved (409 otherwise); the patient never changes on a move.
- The calendar uses its own toolbar (kit buttons) instead of react-big-calendar's, so it stays usable at
  phone width while the grid scrolls sideways. In week and month views chairs aren't columns: a week
  split by three chairs is 21 columns.
- Status is printed on every event as well as coloured; booked is a dashed outline, done is faded,
  no-show is struck through.
- `app-shell.tsx`: `<main>` gained `min-w-0`. Without it the month grid pushed the page wider than the
  window (a grid column's minimum width is its content's).
- Seed: two weeks either side of today, Mon–Sat, each dentist pinned to one chair at one appointment per
  hour, so it never double-books (a test checks this). Chair 3 is left free. Past slots are done (85%),
  no-show (10%) or cancelled (5%); a slot running now is "arrived". Mock DB key bumped to `v4`.
**Gate:** `pnpm run check` — green (shared 17/17, web 14/14). `eslint src` — clean.
**Notes:** Browser check (Playwright, dev server on :3200; :3000 and :3100 belong to other servers),
13 checks passing: day view shows Chair 1/2/3 columns; week and month render; picking a procedure fills
reason and minutes; booking works; a second booking on the same chair 5 minutes later is refused with
"Chair 3 is already booked at 5:15 PM" and the form stays open; reschedule via the form; confirm → check
in → Start visit lands on the patient record with the visit running and the card showing "In chair";
Finish visit → the calendar shows Done; a no-show raises the patient's count 0 → 1 and survives a
refresh; no page-level horizontal scroll at 390px. The only console error is the deliberate 409.
Drag-and-drop reschedules within a chair column (9:00 → 9:15, "Appointment moved"). A drag across to
another chair column was **not** confirmed: in headless Chromium the drop stayed in the source column.
The drop handler passes react-big-calendar's `resourceId` through as `chairId`; try it by hand.

## Phase 15: Clinical photos (Chunk 15) — 2026-10-03

**Steps completed:** upload or take a photo (`<input capture>`), compressed in the browser, file stored in
IndexedDB; gallery by visit and type; before ↔ after slider.
**Files changed:** `packages/shared/src/schemas/photo.ts`, `packages/shared/src/index.ts`,
`apps/web/src/mocks/{blob-store,db,seed,handlers,handlers.test}.ts`, `apps/web/src/lib/api-client.ts`,
`apps/web/src/features/photos/{api,mocks}.ts`,
`apps/web/src/features/photos/components/{photos-tab,upload-photo-dialog}.tsx`,
`apps/web/src/features/patients/components/patient-record.tsx`.
**Deviations from plan:**
- Before/after is a `stage` on the photo, not a fourth type: a "before" shot is still intraoral. Types are
  intraoral, extraoral, X-ray and referral document. Photos can carry an FDI tooth (validated like chart
  entries), and the comparison pairs the latest before and after of the chosen tooth.
- Photos go through the API like every other record: `POST /patients/:id/photos` is multipart (`file` plus
  `meta` JSON), `GET /photos/:id/file` serves the image, so the NestJS + S3/R2 version keeps the same
  contract. Metadata lives in the localStorage db (`db.photos`); files live in IndexedDB
  (`mocks/blob-store.ts`; a Map under the Node handler tests). "Reset demo data" deletes both.
- `api()` no longer forces a JSON Content-Type when the body is `FormData`.
- Images are re-encoded as JPEG, at most 1600px on the long side. Images only (`image/*`); referral PDFs
  are deferred. The handler rejects non-images (400) and files over 10 MB (413).
- The visit defaults to the one in progress; a photo can also be unlinked. Ungrouped photos sit last.
- "Side by side" is a second layout next to the slider, since the "done when" asks for side by side and
  the feature asks for a slider.
- Plain `<img>`, with the lint rule disabled in `photos-tab.tsx`: `next/image` optimises on the server,
  which can't reach a file held in the browser.
- No seeded photos (a blob can't be seeded deterministically into IndexedDB without a real image).
- The Photos tab stays in the `LATER_TABS` order and renders `PhotosTab` for its slot, so the tab order
  doesn't change.
**Gate:** `pnpm run check` — green (shared 17/17, web 16/16). `eslint src` — clean.
**Notes:** Browser check (Playwright, :3200), 8 checks passing, no console errors: empty state; a missing
file and tooth 19 show field errors; 3000×2000 PNG before and after of tooth 74 are stored as 1600px
JPEGs (20–26 KB) in IndexedDB; the comparison appears for tooth 74; **after a refresh** "Side by side"
shows the before and after of tooth 74; no page-level horizontal scroll at 390px. Not exercised in the
browser: the camera (`capture`) on a real phone, and defaulting to the in-progress visit.

## Review follow-up — 2026-10-03

The tester and auditor ran independently.
- **Fixed:** "Reset demo data" hung for 17–19 s, or never reloaded, once a photo had been read or written.
  `blob-store.ts` opened an IndexedDB connection per call and never closed it, which blocked
  `deleteDatabase`. Each connection now closes when its transaction ends. The tester's `reset15.mjs`,
  run twice after the fix: reload in 1030 ms and 897 ms, file store gone, gallery empty, exit 0.
  `pnpm run check` is green (shared 17/17, web 16/16).
- **Closed:** dragging to another chair works. The tester moved Chair 1 → Chair 2 and Chair 1 → Chair 3,
  and the move survived a reload (`drag10b.mjs`). My earlier failure came from grabbing the resize handle.
- **Left as is (not roadmap requirements):**
  - The appointment sheet stays open after a cancel, showing Cancelled.
  - A visit started from the banner, not from the appointment, leaves an arrived appointment at "Arrived".
  - `capture="environment"` may make some phones open only the camera.
