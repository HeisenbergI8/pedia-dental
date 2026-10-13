# Implementation log: chunk 24 (privacy, terms and consent)

The user asked for the plan's defaults (P1–P26) unless they contradict privacy decisions.md; none do, so all are taken.

## Phase 1: Shared templates and privacy schemas — 2026-10-14

**Steps completed:** 1.1, 1.2
**Files changed:** new `packages/shared/src/schemas/legal.ts`, `domain/legal.ts`, `domain/legal.test.ts`; `index.ts`.
**Deviations from plan:** none.
**Gate:** `pnpm run check -- domain/legal` green (5/5).

## Phase 2: Contract changes and mock API — 2026-10-14

**Steps completed:** 2.1–2.7
**Files changed:** shared `schemas/{patient,signup,operator,auth,document}.ts`, `domain/{permissions,documents}.ts`;
web new `mocks/seed-privacy.ts`, `mocks/privacy.ts`, `mocks/privacy.test.ts`, `features/legal/mocks.ts`,
`components/check-field.tsx`; changed `mocks/{db,seed,seed-ngiti,seed-ipin,seed-signups,access,handlers,signups,outbox}.ts`,
`features/{auth,patients,photos,messages,clinic,signup,operator}/mocks.ts`, `features/patients/api.ts`,
`features/documents/{content.ts,components/documents-tab.tsx}`, `features/operator/components/create-account-dialog.tsx`;
tests `mocks/{handlers,tenancy,signups,operator-signups,operator,owner-settings}.test.ts`, `features/documents/content.test.ts`.
**Deviations from plan:**
- `privacy.test.ts` "asks a staff login to acknowledge confidentiality": the final list read as a dentist is parsed with
  `z.array(z.unknown())`; the plan's `z.array(Patient)` fails because a dentist's view omits guardian contacts.
- `operator.test.ts` "gives an old Owner whose branches were all archived…": the hand-built old Owner is pre-acknowledged
  (`staffAcknowledged`), as the test already pre-clears `mustChange`; the plan's Step 2.4 missed this test.
- `content.test.ts` gains `privacy_consent: {}` in its per-type map now (needed to compile); Step 4.5 adds its test.
**Gate:** `pnpm run typecheck` green. `src/mocks`: 206/207. The one failure, cross-branch "gives the Owner each branch
and the combined total", is pre-existing and time-of-day dependent: it fails identically on commit 00fcb3b (checked in a
throwaway worktree) when run after midnight, because the seed only makes today's Imus payments for appointments already
finished. Flagged as a separate task; not changed here.

## Phase 3: Public pages, legal links, Get started and the console — 2026-10-14

**Steps completed:** 3.1, 3.2, 3.3
**Files changed:** new `features/legal/{api.ts,components/legal-links.tsx,legal-document.tsx,clinic-notice.tsx}`,
`app/legal/[doc]/page.tsx`, `app/legal/notice/[clinicId]/page.tsx`; changed `features/signup/components/{signup-frame,get-started-screen}.tsx`,
`features/signup/api.ts`, `features/operator/components/account-detail.tsx` (AgreementCard), `features/auth/components/login-screen.tsx`.
**Deviations from plan:** none (`lib/format.ts` is not client-only, so the legal page uses `formatDate`).
**Gate:** typecheck green; `pnpm run check -- design` green (100/100); eslint clean on the touched folders.

## Phase 4: Staff and parent screens — 2026-10-14

**Steps completed:** 4.1–4.6
**Files changed:** new `features/auth/components/acknowledge-screen.tsx`, `features/patients/components/{privacy-consent-dialog,privacy-card}.tsx`,
`features/clinic/components/privacy-notice-form.tsx`, `features/portal/components/portal-privacy.tsx`; changed
`features/auth/{api.ts,components/access-gate.tsx}`, `features/clinic/{api.ts,components/settings-screen.tsx}`,
`features/patients/{api.ts,components/patient-editors.tsx,patient-overview.tsx,patient-header.tsx}`,
`features/portal/components/{portal-home,portal-shell}.tsx`, `features/documents/content.test.ts`.
**Deviations from plan:** none.
**Gate:** typecheck green; `check -- features/patients` 10/10, `features/clinic` 7/7, `features/portal` (typecheck; no test
file matches), `documents/content` 11/11, `design` 100/100; `npx eslint src` 0 errors (2 old warnings).

## Phase 5: Conventions, roadmap and close — 2026-10-14

**Steps completed:** 5.1–5.4
**Files changed:** `CONVENTIONS.md` (v28, Platform shape, legal guard file, `/legal/*` public gate, Privacy domain rule,
the acknowledgement test trap), `ROADMAP.md` (chunk 24 done, built 2026-10-14, demo line in feature 18).
**Gate (5.3):** `pnpm run check`: shared 186/186; web 345/346. The one failure is the pre-existing midnight-only
cross-branch test (see Phase 2), unrelated to this chunk and flagged as its own task. `npx eslint src` 0 errors.
**Walk (5.4):** `scratchpad/walk-chunk24.mjs` on :3150 (dev server restarted with the `web` launch config), data cleared
before and after. 1 PASS legal pages show "Template, pending legal review" + "Version 1", the clinic notice is public,
Privacy/Terms links on sign-in and Get started; 2 PASS unticked sign-up refused, ticked one stored `agreement.method
"online"`; 3 PASS console refuses without "Signed agreement on file", card reads "Signed agreement on file, signed …",
Bulilit "Patients without consent recorded" = 1; 4 PASS registration opens the Parent's consent dialog, unticked stays
open, ticked saves and the Privacy card shows consented/recorded by Liza Cruz; 5 PASS an intraoral upload for a child
with photos declined shows "declined clinical photos"; 6 PASS parent sees the notice with consents, then the portal, and
goes straight in next time; 7 PASS Owner saves notice version 2, parent shown Version 2; 8 PASS outdated terms stop the
Owner only (admin unaffected), Accept disabled until ticked, then in; 9 PASS a new staff login sees "Patient records are
confidential" once; 10 PASS 375 px dark: 375/375/375. No page errors. Walk-script fixes only (intake answers, a URL wait,
running the photo step as a dentist, editing storage from a non-app page); no app change needed.

## Review fixes (tester + auditor) — 2026-10-14

Tester: done-when met; 1 medium, 3 low. Auditor: 77/100, all 22 steps delivered; 2 medium, 8 low.
- **M1** declining reminders now cancels that child's queued messages (`patients/mocks.ts` privacy-choices); new test.
- **M2** a stale screen could re-grant a declined consent: the route takes `ChangePrivacyChoicesInput` (partial, at least
  one key) and merges it onto the choices on record; the editor sends only the changed key; new test.
- **L1** `/legal/notice/<unknown>` shows "We can't find that clinic's privacy notice" and doesn't retry a 404.
- **L2** focus returns to the Privacy card when the consent dialog closes (`onCloseAutoFocus`).
- **L4** a new clinic's audit log starts with "Terms and DPA (accepted)" from its sign-up agreement; asserted in the test.
- **L6** `RequireSession` re-reads `/auth/me` on focus (keyed by user) and applies a newly waiting step via the store's
  new `refreshUser` (keeps drafts). The password change and acknowledgement prime that cache, which the walk showed was
  needed (without it the acknowledged step came back). Not browser-verified with a version changed mid-session.
- **L7** "Template, pending legal review" on the acknowledgement page (terms/notice) and in Settings' notice card; the
  public notice credits the template only at version 1; "Save new version" is disabled until something changed.
- **L8** the acknowledgement prompt key no longer starts with "auth" (sign-in keeps those).
- Smells: the Privacy card's button reads "Record privacy consent"; `now` renamed `current`.
- **Not changed:** L3 (history shown to staff; the portal shows current choices only, #15 only requires keeping it);
  L5 (optional choices for a child without the required consent would record a "yes" nobody gave; left as 409);
  a paused clinic's parent can't change consents (P16, by design); the profile photo isn't a clinical photo (P14).
**Gate:** `pnpm run check` shared 186/186, web 347/348 (the known midnight cross-branch test only); eslint 0 errors.
**Browser:** walk-chunk24.mjs 10/10 again; fixes24.mjs: unknown notice not-found PASS, focus back to the card PASS.
