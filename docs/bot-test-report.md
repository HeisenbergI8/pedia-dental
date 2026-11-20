# Primolar bot test report

Test date: 2026-11-19, on this computer (localhost). Seven bot testers (BotA to BotG) used the app like real people at the same time.
They used a separate test database `pedia_dental_bot` (API on port 4120, web on port 3180, a production web build, APP_ENV=local).
Your normal database `pedia_dental` was never touched.

## Update: fixes (same evening)

All 47 issues were worked on and re-tested by three independent testers on the same bot stack, plus the full checks
(unit tests, MySQL tests, both web builds, and 476/476 offline browser tests). Most are fully fixed.
Follow-up (2026-11-20): #13's untried parts now have MySQL tests (a request for 2099, a payment dated 2099, both refused);
#28 refuses plan work on a tooth the chart records as extracted or missing; #41's switch reads "Standard / Text / Image"
on a phone and fits at 320 px. Known gaps, kept on purpose:
- **#10** the "limit reached" notice now shows when fewer than 5 text parts are left (not after the first failed text).
- **#22** the guardian name still starts with the child's surname (kept by design); the typing glitch is gone.
- **#16/#17** need checking after deploy: Vercel's own upload size limit, and that Vercel sets the real client address.
  Off Vercel, the web proxy sends no client address, so all callers share one sign-in rate-limit bucket.

Product choices made while fixing: bookings up to 5 years ahead and not in the past; reports accept days from 2000 to
6 years ahead; guardian phone is a PH mobile or a landline; amounts and bills capped at ₱10,000,000; a new branch gets
"Chair 1"; only an admin or dentist can be made Owner; names keep their characters as typed (invisible ones removed).

## Summary

| Run | Scenarios | Passed | Found problems |
|---|---|---|---|
| BotA operator, sign-up, plans | 62 | 53 | 9 |
| BotB Owner and admin | 60 | 49 | 11 |
| BotC front desk | 56 | 39 | 16 |
| BotD dentist | 62 | 49 | 13 |
| BotE billing | 48 | 41 | 6 |
| BotF parent portal | 95 | 81 | 8 |
| BotG security and isolation | 52 | 45 | 7 |
| **Bots total** | **435** | **357** | **70** |
| Automated browser tests (offline run) | 478 tests | 474 | 2 failed, 2 skipped |

After merging the same problem seen by several bots: **47 distinct issues**.
**1 Critical** (already fixed, not committed) · **3 High** · **18 Medium** · **25 Low**.

**No data leaks were found.** No clinic could see another clinic's data. No parent could see another family's child.
BotG tried more than 60 clinic routes with other clinics' ids, and every try was refused.

**Ready to deploy?** Not yet. Do these first. They are small:
1. **Commit the PDF fix (issue 1).** It is in your working tree but not committed. Commit 89cae9d is not pushed yet. If you deploy without it, every PDF download hangs.
2. **Issue 2:** a changed parent phone is not copied to brothers and sisters, so an invite can go to an old number.
3. **Issue 3:** a new branch has no chairs, so nobody can book there. This blocks every Clinic or Pro clinic that adds a branch.
4. **Issue 4:** the operator console can't add the first support contact for a clinic.

Can wait until after the first clinic: all Medium and Low issues. Good quick wins first: issue 5 (one schema change stops most of the 500 errors),
issue 15 (a minus amount saved as a payment) and issues 6 and 7 (wrong texts sent to parents).

---

## Issues (most serious first)

### 1. PDF downloads hang because of the new security policy (FIXED, NOT COMMITTED)
- **Severity:** Critical (fixed in the working tree)
- **Account type and plan:** everyone who downloads a PDF (receipts, certificates, prescriptions), any plan
- **What I did:** downloaded any PDF after commit 89cae9d.
- **What I expected / what happened:** expected the file. It hung forever. The new `worker-src 'self'` rule blocked the `blob:` worker that react-pdf uses.
- **Where:** `apps/web/next.config.ts`
- **Fix idea:** the fix (allow `blob:` in `worker-src`) is already in the working tree, and the bot build used it. **Commit it before you deploy.**
- Found by: lead (LEAD-3)

### 2. Changing a parent's phone on one child leaves the old number on the brothers and sisters
- **Severity:** High
- **Account type and plan:** Owner or front desk, any plan (tested on Clinic)
- **What I did:** a mother has two children. I opened the full Edit on one child and changed her mobile. Then I resent her invite from the other child's page.
- **What I expected / what happened:** expected both children to get the new number, as Quick update does. Only the edited child changed. The invite went to the **old** number, but it set the password for the login on the **new** number. The number-clash check then let another family take the old number. So whoever holds the old phone can set the mother's password. A login can also move to a number that resets never reach.
- **Where:** `PUT /patients/:id`. In `apps/api/src/patients/patient-writes.service.ts`, `update()` changes this child only. Compare `quickUpdate()`.
- **Fix idea:** copy a changed guardian phone and email to every child with that guardian id, as PATCH does.
- Found by: BotF (BotF-1). Confirmed 4 times.

### 3. A new branch has no chairs, so nobody can book appointments there
- **Severity:** High
- **Account type and plan:** Owner, Clinic and Pro (any plan with more than one branch)
- **What I did:** added a 2nd branch, switched to it, then opened New appointment.
- **What I expected / what happened:** expected "Chair 1", like the first branch gets. The chair list was empty and the calendar showed "No open time". There is no screen to add a chair.
- **Where:** `apps/api/src/clinic/branches.service.ts`, which makes no chair. Compare `apps/api/src/signups/clinic-factory.ts:65`.
- **Fix idea:** create "Chair 1" with every new branch, or let the Owner add chairs.
- Found by: BotD (BotD-1)

### 4. The operator console can't show or add a support contact for a clinic that has none yet
- **Severity:** High
- **Account type and plan:** operator. Matters most for Pro clinics ("your own Primolar contact").
- **What I did:** opened a clinic account that has no support contact yet.
- **What I expected / what happened:** expected an empty card with an Add form. Got a red "We couldn't load the support contact" card and no form. The API sends 200 with an empty body, and the web fails to read it as JSON.
- **Where:** `apps/api/src/platform-settings/support.controller.ts:29`, `apps/web/src/lib/api-client.ts:28`
- **Fix idea:** send JSON `null`, as `payment-qr.controller.ts` does.
- Found by: BotA (BotA-2)

### 5. Too much text in a field crashes the save with "Something went wrong" (error 500)
- **Severity:** Medium
- **Account type and plan:** public sign-up, Owner, front desk, dentist, parent. Every plan.
- **What I did:** typed more than the database column holds into these fields: sign-up owner and branch names; branch name, address and phone; staff name, email and licence; guardian name, relationship, phone, email and id; emergency contact; previous clinic; chart note; growth "speech"; appointment reason (about 66,000–70,000 characters); photo caption.
- **What I expected / what happened:** expected "Keep this under N characters". Got a 500 error, and the form gives no hint. Nothing half-saved was left. A 70,000-character photo caption gives the wrong message ("This field is required"). A 5,000-character caption from a parent is saved.
- **Where:** shared schemas without `.max()`: `packages/shared/src/schemas/patient.ts` (Guardian), `clinic.ts` (AddStaffInput), `tenancy.ts` (Branch), `signup.ts`, `chart.ts`, `growth.ts`, `appointment.ts`, `photo.ts`.
- **Fix idea:** add `.max()` to match the database columns (as done for patient names), plus `maxLength` on the inputs.
- Found by: BotB, BotC, BotD, BotF, BotG (BotB-1, BotC-5, BotD-4, BotF-2, BotF-6b, BotG-1, BotG-6)

### 6. Appointments can be booked or moved into the past (or year 9999), and the parent is texted
- **Severity:** Medium
- **Account type and plan:** front desk, Clinic
- **What I did:** booked for yesterday, for 2020 and for 9999, and also rescheduled into yesterday.
- **What I expected / what happened:** expected a refusal. All were saved. Each one sent the parent a confirmation and a reminder at once (with no year in the text) and used up the clinic's texts.
- **Where:** `POST /appointments` and `PUT /appointments/:id`. `slotRefusal` in `apps/api/src/appointments/appointment.rules.ts` has no past check, and the date input has no `min`.
- **Fix idea:** refuse start times before now (Manila) and far in the future. Set `min` on the date input.
- Found by: BotC (BotC-1)

### 7. "No-show" works before the appointment and texts "we missed your child"
- **Severity:** Medium
- **Account type and plan:** front desk, Clinic
- **What I did:** chose No-show on an appointment for next week.
- **What I expected / what happened:** expected No-show to be blocked until the start time. It was accepted, and the parent got "we missed …" days before the visit.
- **Where:** `POST /appointments/:id/status` (`statusRefusal` / `canTransition`)
- **Fix idea:** allow No-show only after the start time, and hide the button before then.
- Found by: BotC (BotC-2)

### 8. Patient search misses "Niño" when typed "nino", and misses phones typed as "+63…"
- **Severity:** Medium
- **Account type and plan:** front desk, Clinic
- **What I did:** searched "nino", "penaflor" and "+639175550310".
- **What I expected / what happened:** expected the child. Nothing was found. The booking box then offers to register "nino" as a new patient, which invites a duplicate.
- **Where:** `apps/api/src/patients/patient-search.ts`, `packages/shared/src/domain/patient-list.ts` (`searchWords`)
- **Fix idea:** remove accents on both sides (as `sameText` does), and treat a leading 63 the same as 0.
- Found by: BotC (BotC-3, BotC-4)

### 9. Phone number fields accept nearly anything (6 digits, letters, `<script>`)
- **Severity:** Medium
- **Account type and plan:** front desk and Owner, any plan. Operator for the support contact.
- **What I did:** saved guardian phones "917555", "abcdefg" and `<script>…`, and a Pro support contact phone "abc-not-a-phone!!".
- **What I expected / what happened:** expected "Enter a mobile number like 0917 123 4567". All were saved, so reminders for that child can never arrive. The screen shows them safely as plain text.
- **Where:** `Guardian.phone` (only `min(7)`) in `packages/shared/src/schemas/patient.ts:12`. `SupportContact.phone` in `tenancy.ts:125`.
- **Fix idea:** use a PH mobile check (09XXXXXXXXX) for guardians, and the branch phone check for the support contact.
- Found by: BotC, BotG, BotA (BotC-6, BotG-2, BotA-9)

### 10. The Owner's text-limit notice says texts "stop at 1500" while texts are already failing
- **Severity:** Medium
- **Account type and plan:** Owner, Clinic (1,500 texts)
- **What I did:** used 1,499 of 1,500 text parts, then opened the Dashboard and Plan.
- **What I expected / what happened:** 641 reminders had already failed with "Monthly text limit reached", but the notice still showed only a warning. Front desk sees no notice at all.
- **Where:** `textAllowanceNotice` in `packages/shared/src/domain/allowance.ts`
- **Fix idea:** show the "limit reached" notice once any text fails for the limit, or when fewer than about 5 parts are left.
- Found by: BotC (BotC-7)

### 11. Texts refused because of the clinic's limit mark the child "No contact"
- **Severity:** Medium
- **Account type and plan:** front desk, Clinic
- **What I did:** opened Patients → Needs attention after the clinic ran out of texts.
- **What I expected / what happened:** the child is flagged "No contact", as if the family's number were wrong. A paused clinic would do the same.
- **Where:** `hasNoContact` in `packages/shared/src/domain/patient-list.ts`
- **Fix idea:** ignore failures caused by the text limit or a paused clinic.
- Found by: BotC (BotC-8)

### 12. The message log loads every message ever at once
- **Severity:** Medium
- **Account type and plan:** front desk, any plan
- **What I did:** opened Messages after about 1,100 texts.
- **What I expected / what happened:** got all 1,092 rows (4.8 MB) in one go. It takes about 1.6 s locally and grows every month.
- **Where:** `GET /messages` in `apps/api/src/messages/messages.controller.ts`
- **Fix idea:** load it in pages (for example the 50 newest), like `/patient-summaries`.
- Found by: BotC (BotC-9)

### 13. Dates with no sensible limits: future photo and payment dates, requests in 2099, dates before birth
- **Severity:** Medium
- **Account type and plan:** dentist, parent and operator, any plan
- **What I did:** set photo "Taken on" to 2027–2030 (dentist and parent); set the payment "Paid on" to 2099-12-31 (operator); sent a booking request for 2099 and one for a closed Sunday (parent); set a photo or habit date before the child was born; set a birth date of 1900.
- **What I expected / what happened:** expected a refusal. All were saved. A future photo sorts above today's photos. 1899 gets the wrong message ("Enter the date of birth").
- **Where:** `packages/shared/src/schemas/photo.ts`, `growth.ts`, `appointment.ts` (AppointmentRequest), `signup.ts` and `payments.ts` (`paidOn`), `patient.ts` (`birthDate`). The date inputs have no `max`.
- **Fix idea:** no dates after today (Manila) and none before the birth date; request dates within about a year on an open day; a minimum birth year.
- Found by: BotD, BotA, BotF, BotC (BotD-3, BotD-10, BotA-6, BotF-6a/c/d, BotC-11)

### 14. Starting a visit from the patient page ignores today's checked-in appointment
- **Severity:** Medium
- **Account type and plan:** dentist, any plan
- **What I did:** the child was checked in (Arrived). I pressed "Start visit" on the patient page, then finished the visit.
- **What I expected / what happened:** expected the visit to be linked to the appointment. It started as a walk-in, and the appointment stays "Arrived" forever. Today's counts are then wrong.
- **Where:** `apps/web/src/features/visits/components/visit-banner.tsx:34-37` (sends no `appointmentId`)
- **Fix idea:** start the visit from today's arrived appointment, or ask.
- Found by: BotD (BotD-2)

### 15. Typing a minus amount in "Record payment" quietly saves a positive payment
- **Severity:** Medium
- **Account type and plan:** Owner or front desk, any plan
- **What I did:** typed `-500` in Record payment.
- **What I expected / what happened:** expected "Enter an amount above zero". It saved a +₱500 payment. The refund and deposit forms do the same.
- **Where:** `apps/web/src/features/billing/components/payment-dialog.tsx` (`Math.abs`)
- **Fix idea:** refuse zero or negative amounts instead of using `Math.abs`.
- Found by: BotE (BotE-1)

### 16. Uploading a file over 10 MB gives a bare "Internal Server Error"
- **Severity:** Medium
- **Account type and plan:** parent (also staff uploads through the web)
- **What I did:** uploaded 10 MB + 1 byte and 11 MB files through the web.
- **What I expected / what happened:** expected "Files must be under 10 MB" (413). Got 500. The web `/api` proxy fails first.
- **Where:** `apps/web/src/middleware.ts`, `apps/web/next.config.ts` (no body-size setting)
- **Fix idea:** raise the proxy body limit a little above 10 MB, or answer 413 there. Check Vercel's own limit after deploy.
- Found by: BotF (BotF-5)

### 17. The web proxy passes the caller's own X-Forwarded-For to the API
- **Severity:** Medium (depends on Vercel; check after deploy)
- **Account type and plan:** signed out
- **What I did:** made 20 sign-in tries, got blocked, then changed the X-Forwarded-For header.
- **What I expected / what happened:** expected to stay blocked. The next try went through, so a caller can pick the address the per-address limits count. The per-account lock still works.
- **Where:** `apps/web/src/middleware.ts` (headers copied as they are)
- **Fix idea:** set X-Forwarded-For from the platform's real client IP. Then confirm on the deployed site.
- Found by: BotG (BotG-4)

### 18. Text top-up receipts are labelled "Setup fee and first month"
- **Severity:** Medium
- **Account type and plan:** Owner, Clinic
- **What I did:** sent text top-up receipts, then looked at "Top-up receipts you sent".
- **What I expected / what happened:** expected "Text top-up, N packs". Every row says "Setup fee and first month".
- **Where:** `apps/web/src/features/payments/components/receipt-list.tsx:5`
- **Fix idea:** when `packs` is set, show "Text top-up, N packs (N texts)".
- Found by: BotA (BotA-3)

### 19. While a downgrade waits, the Plan page says "1 of 3 branches" but adding a branch is refused as "Starter plan"
- **Severity:** Medium
- **Account type and plan:** Owner, Clinic with a downgrade to Starter booked
- **What I did:** the operator booked a downgrade. The Owner clicked Add branch.
- **What I expected / what happened:** the page says Clinic and "1 of 3", but the refusal says "Your Starter plan includes 1 branch". The rule is intended, but the screen and the refusal disagree.
- **Where:** `apps/api/src/clinic/limits.ts` (`usageOf` vs `assertRoomFor`)
- **Fix idea:** show the limit that will really apply, or say "Your plan moves to Starter on 19 Dec".
- Found by: BotA (BotA-4)

### 20. The operator can make a Front desk login the clinic Owner
- **Severity:** Medium
- **Account type and plan:** operator, any plan
- **What I did:** Transfer ownership → picked a Front desk login.
- **What I expected / what happened:** the rule says the Owner is an Admin or a Dentist, never Front desk (sign-up refuses it). The transfer worked.
- **Where:** `apps/api/src/operator/operator-accounts.service.ts:80`, `transferProblem` in `packages/shared/src/domain/tenancy.ts`
- **Fix idea:** offer only admins and dentists, and refuse other roles.
- Found by: BotA (BotA-5)

### 21. An Admin can't open Privacy requests or the Audit log in the web app
- **Severity:** Medium
- **Account type and plan:** Admin, any plan
- **What I did:** signed in as an Admin and opened Settings.
- **What I expected / what happened:** the API allows Admins (`privacy.manage`, `audit.view`), but the web shows these tabs only to the Owner.
- **Where:** `apps/web/src/features/clinic/components/settings-screen.tsx` (`if (!can("clinic.manage"))`)
- **Fix idea:** show the tabs when the person has `privacy.manage` or `audit.view`.
- Found by: BotB (BotB-2)

### 22. The guardian name box puts in the child's surname, and fast typing lands in the wrong place
- **Severity:** Medium
- **Account type and plan:** admin or front desk, any plan
- **What I did:** New patient → clicked the guardian "Full name" box and typed straight away.
- **What I expected / what happened:** the box fills in the child's surname and moves the cursor to the start one frame later, so the first letter lands at the end ("aria Dela CruzM"). Even when typed slowly, a mother with a different surname gets the child's surname added ("Ana Reyes Bautista"). Two browser tests show this every run (admin.spec.ts:285, frontdesk.spec.ts:321).
- **Where:** `apps/web/src/features/patients/components/patient-form.tsx:384` (`requestAnimationFrame`)
- **Fix idea:** set the cursor at once on focus or pointerdown. Better: offer the surname as a one-tap suggestion instead of typing it in.
- Found by: lead (LEAD-1), BotC (BotC-13), BotD (note)

### 23. Very large peso amounts give "Something went wrong" (500)
- **Severity:** Low
- **Account type and plan:** Owner or dentist, any plan
- **What I did:** a plan fee above ₱21,474,836.47, or a bill whose total is above that.
- **What I expected / what happened:** expected "Fees can be at most ₱…". Got 500. The money columns are 32-bit numbers.
- **Where:** `Centavos` in `packages/shared/src/schemas/common.ts:27` has no maximum. Prisma `PlanItem.fee`, `InvoiceLine.amount` and others.
- **Fix idea:** give `Centavos` a sensible maximum (for example ₱10,000,000) and check a bill's total.
- Found by: BotD, BotE (BotD-5, BotE-2)

### 24. Finance and Today reports crash on far-off dates
- **Severity:** Low
- **Account type and plan:** Owner
- **What I did:** `GET /reports/finance?today=1900-01-01` (also 0001 and 9999), and `/reports/today?today=9999-12-31`.
- **What I expected / what happened:** expected a 400 or an empty report. Got 500.
- **Where:** `apps/api/src/reports/reports.service.ts` (`isDay`)
- **Fix idea:** limit `today` to a sensible range (for example 2000 to next year).
- Found by: BotE (BotE-5)

### 25. Long words with no spaces push pages sideways (mostly on phones)
- **Severity:** Low
- **Account type and plan:** operator, Owner, dentist, front desk and parent
- **What I did:** used long one-word names or text: a clinic name (console and public status page), a branch name (Branches table), a behaviour note (Notes and Overview), a patient alert (5,000 characters), and a child's name (portal home and privacy notice).
- **What I expected / what happened:** expected the text to wrap. The pages became 450–39,000 px wide. On the portal, the "I've read this" button was hard to tap. Alerts and appointment reasons have no length limit.
- **Where:** PageHeader h1, `branches-panel.tsx`, the notes and overview cards, the patient alert banner, `portal-privacy.tsx:37`
- **Fix idea:** add `break-words` / `overflow-wrap:anywhere` / `min-w-0`, and cap alerts and reasons (about 200 characters).
- Found by: BotA, BotB, BotC, BotD, BotF (BotA-7, BotB-6, BotC-12, BotD-8, BotF-7)

### 26. Invisible characters get past the checks (a lookalike clinic name, reversed text)
- **Severity:** Low
- **Account type and plan:** public sign-up and Owner
- **What I did:** signed up "BotA-Starter Dental" with a hidden zero-width space inside, and named a child with a right-to-left override character.
- **What I expected / what happened:** the clinic name passed the duplicate check, so there are now two clinics that look identical. Names can look different on screen and on printouts.
- **Where:** `clinicNameKey` in `packages/shared/src/domain/signup.ts`, and the name fields in `patient.ts` and `clinic.ts`
- **Fix idea:** strip zero-width and direction characters (Unicode Cf) and normalise (NFKC) when saving names.
- Found by: BotA, BotG (BotA-1, BotG-7)

### 27. Times follow the computer's time zone, not Manila
- **Severity:** Low (Medium if a clinic laptop has the wrong time zone)
- **Account type and plan:** front desk, any plan
- **What I did:** opened Today and Billing with the browser set to UTC or Honolulu.
- **What I expected / what happened:** a 9:00 AM appointment showed as 1:00 AM, and "Today's collections" showed the wrong day. The server and the PDFs use Manila time.
- **Where:** web date formatting (date-fns, `collections-list.tsx`, `billing-tab.tsx`, `receipt-rows.ts`)
- **Fix idea:** work out "today" and format times in Asia/Manila across the web app.
- Found by: BotC, BotE (BotC-16, BotE-3)

### 28. Treatment plan and appointment links aren't checked (the same finding can go on the plan twice)
- **Severity:** Low (could lead to billing one filling twice; the UI double-click wasn't tried)
- **Account type and plan:** dentist or Owner, any plan
- **What I did:** added the same chart finding to the plan twice; added a finding from another tooth or another clinic; planned work on an extracted tooth; booked with procedure "nope".
- **What I expected / what happened:** expected a refusal. All were saved. Nothing from the other clinic is shown back.
- **Where:** `apps/api/src/plan/plan.service.ts:58`, `apps/api/src/appointments/appointments.service.ts:84`
- **Fix idea:** one open item per finding; the finding must be on this child and on the same tooth; check procedure codes.
- Found by: BotD, BotG (BotD-11, BotG-3)

### 29. The chart accepts the same surface twice ("Caries · OO")
- **Severity:** Low
- **Account type and plan:** dentist (API only; the UI can't send it)
- **Where:** `packages/shared/src/schemas/chart.ts` (surfaces)
- **Fix idea:** refuse or remove repeated surfaces.
- Found by: BotD (BotD-9)

### 30. Another clinic's patient id on a list route answers "empty list" and writes an audit row
- **Severity:** Low (no data is shown)
- **Account type and plan:** Owner, any plan
- **What I did:** `GET /patients/<other clinic's patient>/invoices` and `/payments`. Other list routes act the same.
- **What I expected / what happened:** expected 404. Got 200 `[]`, and the audit log names the other clinic's patient id.
- **Where:** `invoices.service.ts` `list`, `payments.service.ts` `history`
- **Fix idea:** check the patient exists in this clinic first, and answer 404.
- Found by: BotE, BotG (BotE-4, BotG note)

### 31. A baby born today shows "Birthdays today · Turning 0" and gets a birthday text
- **Severity:** Low
- **Where:** `isBirthdayOn` / the birthday greeting in `apps/api/src/messages/messages.service.ts`
- **Fix idea:** skip children born this year.
- Found by: BotC (BotC-10)

### 32. Double-clicking "Start visit" on the appointment sheet shows a red error and stays put
- **Severity:** Low
- **Account type and plan:** dentist
- **What I expected / what happened:** the first click starts the visit. The second gets 409 "already has a visit in progress", and the page doesn't move.
- **Where:** `apps/web/src/features/appointments/components/appointment-sheet.tsx:107-116`
- **Fix idea:** add the same one-request guard as `visit-banner.tsx`.
- Found by: BotD (BotD-6)

### 33. Emoji in names or prescription text print as junk in PDFs
- **Severity:** Low
- **What happened:** a prescription showed "<!" next to the dose. A certificate showed "Reyes =" and lost the comma.
- **Where:** `apps/web/src/features/documents/components/document-pdf.tsx`
- **Fix idea:** remove characters the PDF font can't draw, or add an emoji fallback font.
- Found by: BotD (BotD-7)

### 34. Big peso amounts break across lines on the phone dashboard
- **Severity:** Low (looks only)
- **What happened:** "₱21,479,648.9" with the "8" on the next line. The bar labels are cut off.
- **Fix idea:** use a compact format (₱21.5M) or a smaller font at phone width.
- Found by: BotE (BotE-6)

### 35. Set-password page: the heading and the text contradict each other
- **Severity:** Low
- **What happened:** for an unknown link, the heading says "expired or already used" and the text says "isn't complete".
- **Where:** `apps/web/src/app/set-password`
- **Fix idea:** show "incomplete" only when the link format is wrong.
- Found by: BotF (BotF-3)

### 36. The clash message says a parent "already signs in to the portal" when they were only invited
- **Severity:** Low
- **Where:** `clashText` in `apps/api/src/portal/portal.service.ts`
- **Fix idea:** "is already used by <name> for the portal".
- Found by: BotF (BotF-4)

### 37. A password reset accepts the same password as before
- **Severity:** Low
- **Where:** `PortalService.accept`
- **Fix idea:** ask for a new password, as ChangePasswordInput does.
- Found by: BotF (BotF-6e)

### 38. Staff removing a parent's upload gives the parent back a slot in that month's limit of 20
- **Severity:** Low (fine if "20 stored" is what you mean)
- **Where:** `parentUse` in `apps/api/src/photos/photos.service.ts`
- **Fix idea:** count files sent, or label it "20 stored this month".
- Found by: BotF (BotF-8)

### 39. Web pages send `X-Powered-By: Next.js`
- **Severity:** Low
- **Where:** `apps/web/next.config.ts`
- **Fix idea:** `poweredByHeader: false`.
- Found by: BotG (BotG-5)

### 40. Settings lets an Owner use another clinic's contact email
- **Severity:** Low
- **What happened:** sign-up refuses a contact email another clinic has, but `PUT /clinic` saves it. Later sign-ups with it are then refused.
- **Where:** `apps/api/src/clinic/clinic.service.ts` ~137
- **Fix idea:** run the same duplicate check as sign-up.
- Found by: BotB (BotB-3)

### 41. On a phone, the letterhead "Standard / Your own text / Your own image" switch runs off the screen
- **Severity:** Low
- **Where:** `apps/web/src/features/clinic/components/letterhead-card.tsx`
- **Fix idea:** let it wrap or stack, or use shorter labels.
- Found by: BotB (BotB-4)

### 42. A clinic can have two branches with the same name
- **Severity:** Low
- **Where:** `branches.service.ts` (POST and PUT /branches)
- **Fix idea:** refuse a name that matches another open branch, ignoring case and spaces.
- Found by: BotB (BotB-5)

### 43. A branch open all day shows "12:00 AM–12:00 AM"
- **Severity:** Low
- **Fix idea:** show "Open 24 hours".
- Found by: BotB (BotB-8)

### 44. Staff Settings page says "Read-only in this prototype."
- **Severity:** Low
- **Account type and plan:** Admin, dentist and front desk, any plan
- **Where:** `apps/web/src/features/clinic/components/clinic-settings.tsx`
- **Fix idea:** "Only the Owner can change these."
- Found by: BotB, BotC (BotB-7, BotC-15)

### 45. Length messages say "under 60/80 characters" but 60/80 is allowed
- **Severity:** Low
- **Where:** `packages/shared/src/schemas/tenancy.ts:85`, `patient.ts`, and the letterhead fields
- **Fix idea:** "60 characters or fewer".
- Found by: BotA, BotC (BotA-8, BotC-14)

### 46. Repeated word in a refusal: "the certificate is for for this patient"
- **Severity:** Low
- **Where:** `apps/api/src/documents/documents.rules.ts:20`
- **Fix idea:** "Pick one of this patient's finished visits."
- Found by: BotD (BotD-12)

### 47. A browser test still expects "of 1000" texts on the Clinic plan (test only, not an app bug)
- **Severity:** Low
- **Where:** `payments.spec.ts:128`. The Clinic plan now gives 1,500.
- **Fix idea:** update the test.
- Found by: lead (LEAD-2)

---

## What passed

- **No data leaks.** BotG tried 60+ routes with another clinic's ids and the seeded clinic's ids, and all were refused. Parents can't reach another family's child, even with tricks like a repeated `patientId`. Operator cookies can't read patients, and clinic cookies can't use operator routes. Branch cookies pointing to another clinic are ignored.
- **Sign-up and operator:** the get-started form, prices and VAT, duplicate names and emails, the 5-an-hour limit, logo checks (SVGs are cleaned), double clicks, and parallel approve/payment calls (only one goes through). Invoice numbers have no gaps.
- **Plans:** branch and staff caps per tier, the custom letterhead tier rule, upgrades at once, downgrades on the next due date, cancel/pause/reactivate, top-ups, and receipt checks.
- **Sign-in and security:** forced password change, common passwords refused, lockout after 5 tries (no account probing), per-address limits, logout and password change end sessions, PIN switching and the PIN lockout, httpOnly/SameSite cookies, the security headers, huge or odd JSON refused, and `<script>`/SQL-like text always shown as plain text.
- **Front desk:** registering a child with consent, the duplicate warning, booking (double bookings, closed days, outside hours), check-in, cancel, recalls, birthday greetings, the text allowance cap, and requests from parents.
- **Dentist:** chart, corrections, tooth and surface checks, notes and signing, growth, treatment plan, photos and consent, closed-visit rules, and certificates, prescriptions and referrals (PDFs download).
- **Billing:** invoices, discounts, payments (parallel and repeated requests are safe), deposits, refunds, voids, receipts and PDFs, role limits, collections and finance totals checked by hand.
- **Parent portal:** invites, links used only once, resets, lockouts, uploads and the monthly limit, booking requests, privacy choices, a parent at two clinics, and phone-size pages.
- **Phone size (375 px):** most screens fit. The exceptions are issues 25, 34 and 41.

## What couldn't be tested (check after deploy)

- Real SMS delivery (invites, resets, reminders, "number changed"), real email, and how the SMS provider counts text parts and handles ñ/emoji.
- Real GCash, Maya and bank payments, and S3 file storage with 5-minute links.
- Origin lock (`x-primolar-origin` / ORIGIN_SECRET), HSTS on the real domain, WAF rules, and the `Secure` flag on cookies (off locally).
- X-Forwarded-For on Vercel (issue 17) and Vercel's request-body limit for 10 MB uploads (issue 16).
- PDF worker security policy on the deployed host (issue 1).
- Jobs that depend on the date: overdue → grace → paused clinic (billing-only Owner), downgrades applying on their date, the nightly settle job, unpaid sign-ups auto-rejected after 14 days, rejected files purged after 30 days, birthday batches at Manila midnight, the monthly text reset, reset-link expiry, and 8-hour session timeouts.
- Operator two-step sign-in (TOTP) with a real authenticator, and lockout on the real operator email (a 5-try lockout would lock every operator).
- The 80% texts-used banner, printing on a real printer, and a real phone browser.
- Before launch, set up the operator's payment QR and support email/chat. Without them, clinics see no receipt form and "support details not added yet". Run production with DEMO_LOGINS=false, because demo mode stores raw invite tokens.

## Note on plans

The test request mentioned "Regular / Pro / Max" plans. **They don't exist in the code.** There are only three tiers: `small` / `mid` / `big`, shown as **Starter / Clinic / Pro**.
All bots tested these three. Also, the Plans page sells Pro with "plus export", but the finance export isn't built yet.

## Test data left behind

Everything is only in the separate `pedia_dental_bot` database and the local folder `apps/api/var/storage-bot`. Your dev database `pedia_dental` was never touched.

- **BotA:** BotA-Starter Dental `d703b171-7102-4390-91ab-9f8de2a780a9`, BotA-Clinic Dental `c1d9d52e-4127-4feb-9fa8-7c38421be7c0`, BotA-Pro Dental `292282ee-eea6-40fb-809b-b0b1d15a80cc` (cancelled), the zero-width lookalike "BotA-Starter Dental" `9181a888-8580-4b92-a789-17a45fb37d5d`, and 4 rejected sign-ups.
- **BotB:** BotB-Starter Dental `81c0d0ff-8563-4b91-823a-c3bb693d88c0`, BotB-Pro Dental `f04cb171-bdd3-4577-96fd-be211760293d`.
- **BotC:** BotC-Clinic Dental `8641cf0d-fe5b-4799-940c-f0c1e2a72a12` (about 21 patients, 440 appointments, 1,100 messages).
- **BotD:** BotD-Pro Dental `19362a72-00cd-4e6a-8113-669a80256bca`.
- **BotE:** BotE-Starter Dental `f1d76943-4ad1-42f7-adf8-adbec8f34658`.
- **BotF:** BotF-Clinic Dental `fc34b38e-52ef-4cb8-863b-e66352b7382d`, BotF-Clinic Two `eb79a19b-5f4c-459f-9390-2b978ced08ba`.
- **BotG:** BotG-Alpha Dental `207e1fef-0891-4219-948b-3b5a1c2d558f`, BotG-Beta Dental `2d00c427-e4e2-4b9c-b912-053bc7c72b96`.

**Simplest removal:**
1. Drop the whole test database: `docker exec pedia-dental-mysql mysql -uroot -proot -e "DROP DATABASE pedia_dental_bot"`
2. Delete the folder `apps/api/var/storage-bot`.
3. Delete the local build folder `apps/web/.next-bot`.
4. Remove the two entries `api-bot` and `web-bot` that the lead added to `.claude/launch.json`.

The bots' scripts and screenshots are in the session scratchpad (`…/scratchpad/bot/BotA` … `BotG`). They are temporary and not in the repo.
