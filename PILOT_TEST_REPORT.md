# Pilot test report: 14 Oct 2026

**How it was tested:** 9 AI pilot testers, one for each user type, ran in parallel. Every test used the UI only:
signing in by typing, clicking, filling in forms and reading the screen. No test changed stored data, mocked the network
or called the API.

**Result:** 469 tests. 454 pass. The 15 that fail are bugs, each confirmed again on an idle server. A 16th bug test
passes now because that bug shows up only when the server is slow.

| User type | Tests | Pass | Bugs |
|---|---|---|---|
| Front desk | 51 | 48 | 3 |
| Dentist at two clinics | 59 | 59 | 0 |
| Admin, Imus only | 48 | 46 | 3 (1 intermittent) |
| Owner, Mid plan | 55 | 53 | 2 |
| Plan limits and billing (Ngiti, Ipin) | 44 | 43 | 1 |
| Parent, on a phone | 55 | 52 | 3 |
| Primolar operator | 51 | 49 | 2 |
| New clinic signup | 42 | 41 | 1 |
| Access control, all roles | 64 | 63 | 1 |

Run them again:

```bash
cd apps/web
NEXT_DIST_DIR=.next-build pnpm build && NEXT_DIST_DIR=.next-build npx next start --port 3150   # in one terminal
npx playwright test                      # all tests
npx playwright test --grep "BUG: "       # only the known bugs
```

Each bug test is titled `BUG: …`, checks for the correct behaviour, and stays failing until the bug is fixed.

## Status: all 13 bugs fixed (14 Oct 2026)

After the fixes, the full suite ran 462 passed, 7 failed, 1 skipped (the skip is a birthday test with no birthday in
that day's data). Re-run alone, 3 of the 7 passed, so those were timeouts from running 6 browsers at once. The other 4
failed because the demo data had changed with the time of day, plus a timing race in one test. Those 4 now pin the
browser clock (`pinSeededDay` in `e2e/support/users.ts`), and all 4 pass. The `BUG: …` tests now pass and stay in the
suite as regression tests.

| # | Fix |
|---|---|
| 1, 2 | Save patient and Record payment ignore a second click while the first is saving |
| 3 | The date of birth schema refuses a future date |
| 4 | The page loader clears once the new page lands, so Back no longer waits for the 15-second timeout |
| 5 | Changing privacy choices also refreshes the message log |
| 6 | A booking at another branch is labelled "at Dasmariñas" on the child's record |
| 7 | "Password saved. Welcome!" now shows, even though the screen unmounts on success |
| 8 | Settings keeps its tab in the URL (`?tab=plan`); the billing banner links there |
| 9 | The Approve hint no longer shows "(billing #12)" |
| 10 | A missing patient shows "Patient not found" with a link to Patients, and no Try again |
| 11 | A branch phone must be a phone number (at least 7 digits) |
| 12 | The consent checkboxes are drawn at 24 px below desktop (they already had a 44 px tap area) |
| 13 | Long upload descriptions wrap anywhere, so the page stays at phone width |

## Bugs as found (13 unique, duplicates merged)

### High

1. **Double-clicking Save on the parent's consent step creates the same child twice.** Front desk → New patient →
   fill in the form → Save patient → tick consent → double-click Save patient. Result: two identical records, each
   listed as the other's sibling. Booking an appointment is already protected against double-clicks.
   `features/patients/components/privacy-consent-dialog.tsx`, `patient-editors.tsx` (CreatePatient.save).
2. **Double-clicking Record payment can record the payment twice** *(intermittent, only when the server is slow)*.
   Admin → patient → Billing → Record payment → ₱50 → double-click. Result: two receipts, and the balance drops by ₱100.
   `features/billing/components/payment-dialog.tsx`. The button is disabled only once the request reports pending.

### Medium

3. **A future date of birth is accepted** when registering a child. Found by both the front desk and admin testers.
   `packages/shared/src/schemas/patient.ts`: `birthDate` has no rule against future dates.
4. **The browser Back button shows the "Opening" loader for 13 to 15 seconds.** Found by both the owner and parent
   testers, in the clinic app and the portal. Root cause: in `components/navigation-pending.tsx`, `pendingFrom` is
   never cleared when the new page loads, so going back to that page turns the loader on again until the 15-second
   timeout clears it.
5. **The message log is out of date after a family says no to reminders.** After unticking "Reminder messages
   allowed", Messages still shows the reminder as Queued and Withdrawn (0) until a full page reload.
   `features/patients/api.ts` (useSetPrivacyChoices doesn't invalidate the messages query).
6. **An admin at Imus sees a child's Dasmariñas booking on the patient record with no branch label.** It reads as an
   Imus appointment.

### Low

7. **"Password saved. Welcome!" never appears** after a new staff login or a new Owner chooses a password. Found by both
   the owner and operator testers.
8. **The billing reminder's "See Settings → Plan" link opens the Clinic tab**, not Plan.
9. **A link to a patient who doesn't exist, or who belongs to another clinic, says "Check your connection, then try
   again"**, with a Try again button that can never work, even though the API returned 404. No data leaks.
   `features/patients/components/patient-record.tsx:73`.
10. **Get started accepts text that isn't a phone number** in the branch phone field.
11. **The operator sees an internal decision number "(billing #12)"** in the Approve hint.
12. **The photo and reminder consent switches are 16×16 px on a phone**, too small to tap reliably.
13. **A long upload description with no spaces makes the Uploads page wider than the phone screen.**

## Pilot-user notes worth a decision

- **The demo data changes with the time of day.** Patient names, dentists, statuses and recalls differ between
  sessions, even though seed.ts says the data is the same on every machine. Talking points in DEMO_SCRIPT.md that name
  a child or dentist may not match what a client sees.
- **There's no audit log screen.** Audit entries are recorded but nothing shows them, so an Owner can't see who opened a
  child's record.
- **Parents can't message the clinic.** There's no compose or reply in the portal.
- **"Contact Primolar" is a dead end everywhere.** There's no link, email or phone on the plan limit, upgrade, overdue,
  thank-you and rejection screens.
- **A paused clinic's Owner is told "Contact your clinic"**, but they are the clinic.
- **The Owner's temporary password is gone for good if the operator reloads** before passing it on. The console has no
  reset or reissue.
- **Search doesn't ignore accents.** "Pena" doesn't find "Peña", and "Nino" doesn't find "Niño".
- **Front desk can book appointments in the past**, and a confirmation text is queued for them.
- **The guardian's Full name is pre-filled with the child's surname**, with the cursor placed before it. A guardian with
  a different surname ends up with both.
- **Settings tabs aren't in the URL**, so a reload or Back always lands on Clinic.
- **After signing in from a deep link, you land on your home page**, not the page you asked for, and nothing says
  "please sign in to continue".
- **Get started keeps no draft**, so a reload or an accidental Back clears everything typed.
- **Empty and no-access pages have no heading** for screen-reader users.
- **"Save draft" on a clinical note still requires every field.**
- **A signed note can't be corrected**, even though the demo script says it can be.
