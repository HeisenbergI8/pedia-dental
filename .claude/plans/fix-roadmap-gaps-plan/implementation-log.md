# Implementation log: fix roadmap gaps

User decisions (2026-10-04): Q1 3-month recall from a signed oral exam with caries risk High. Q2 pre-treatment
message when an extraction or pulpotomy is booked, 9 AM the day before, withdrawn on cancel / no-show / move. Q3 an
unticked habit is stopped by that visit (date inferred). Q4 deposits held then applied (append-only pair),
refundable, shown separately as Deposits held. Existing features, flows and permissions keep working.
Branch `fix/roadmap-gaps`.

## Phase 1: Clinic hours and closed days — 2026-10-04

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/domain/appointments.ts` (+ test), `apps/web/src/features/appointments/mocks.ts`,
`apps/web/vitest.config.ts`, `apps/web/src/mocks/handlers.test.ts`, `apps/web/src/features/appointments/components/{appointment-form,appointment-calendar}.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- appointments.test handlers.test` → typecheck ok, shared 10, web 84 passed.
**Notes:** runtime check deferred to the Phase 2 pass (same screens).

## Phase 2: Next open slot — 2026-10-04

**Steps completed:** 2.1, 2.2
**Files changed:** `packages/shared/src/domain/appointments.ts` (+ test), `apps/web/src/features/recalls/components/recall-list.tsx`,
`apps/web/src/features/appointments/components/appointment-requests.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- appointments.test` → typecheck ok, shared 14 passed.

## Phase 3: No fake names, readable short tiles — 2026-10-04

**Steps completed:** 3.1, 3.2
**Files changed:** `apps/web/src/features/patients/components/patient-name.tsx` (new),
`features/appointments/components/{appointment-calendar,appointment-requests}.tsx`, `features/messages/components/message-log.tsx`,
`features/recalls/components/recall-list.tsx`, `features/dashboard/components/finance-dashboard.tsx`,
`features/documents/components/document-log.tsx`, `features/billing/components/collections-list.tsx`
**Deviations from plan:** PatientName also applied to `document-log.tsx` and `collections-list.tsx`, which had the
same `"Patient"` fallback but weren't in the plan's list (same rule, same flash).
**Gate:** `pnpm run check -- design` → typecheck ok, 94 passed.

## Phase 4: Where a follow-up came from — 2026-10-04

**Steps completed:** 4.1, 4.2
**Files changed:** `packages/shared/src/domain/recall.ts` (+ test), `apps/web/src/features/appointments/components/appointment-sheet.tsx`,
`apps/web/src/features/recalls/components/recall-list.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- recall.test` → typecheck ok, shared 10 passed.
**Runtime (phases 1–4, front desk, 1440):** New appointment at 07:15 → "Book between 8:00 AM and 6:00 PM." under
Start; a Sunday → "The clinic is closed on Sundays. Pick another day." 15-minute tile reads "Confirmed · Mazie Lynch".
On Sunday, /recall → Book opened Monday 2026-10-05 08:00 and booked; its sheet shows "Booked from: 6-month recall".

## Phase 5: Behavior wording, note limit, plan track — 2026-10-04

**Steps completed:** 5.1, 5.2, 5.3
**Files changed:** `apps/web/src/features/notes/components/{behavior-trend,note-dialog}.tsx`, `packages/shared/src/schemas/notes.ts`,
`packages/shared/src/domain/notes.test.ts`, `apps/web/src/features/plan/components/plan-tab.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- notes.test design` → typecheck ok, shared 6, web 94 passed.

## Phase 6: Growth habits and seeded growth — 2026-10-04

**Steps completed:** 6.1, 6.2, 6.3
**Files changed:** `packages/shared/src/domain/growth.ts` (+ test), `apps/web/src/features/growth/components/growth-card.tsx`,
`apps/web/src/mocks/{seed,db,seed.test}.ts`, `CONVENTIONS.md` (db key v20)
**Deviations from plan:** Step 6.2's second edit (line 119, "stopped by") was not applied: that line renders one
visit's raw `GrowthRecord.habits`, which never carry `stopInferred` (typecheck caught it). The inferred wording lives
on the habit timeline line (97), which the step also changes.
**Gate:** `pnpm run check -- seed.test growth.test` → shared 6, web 7 passed; full `pnpm run check` green.

## Phase 7: Photos grouped visit → date → type — 2026-10-04

**Steps completed:** 7.1, 7.2
**Files changed:** `packages/shared/src/domain/photos.ts` (new, + test), `packages/shared/src/index.ts`,
`apps/web/src/features/photos/components/photos-tab.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- photos.test` → typecheck ok, shared 3 passed; eslint clean on photos-tab.
**Notes:** runtime check folded into the Phase 12 pass (uploads on two dates).

## Phase 8: Dental clearance document — 2026-10-04

**Steps completed:** 8.1, 8.2, 8.3
**Files changed:** `packages/shared/src/schemas/document.ts`, `packages/shared/src/domain/documents.ts` (+ test),
`apps/web/src/features/documents/content.ts` (+ `content.test.ts`), `components/{document-options,documents-tab}.tsx`,
`apps/web/src/mocks/handlers.test.ts`
**Deviations from plan:** `sourceOptions` and `DOCUMENT_SOURCE_LABEL` are keyed on the type name (the plan flagged
this), so `dental_clearance` was added to both. `documents-tab.tsx` `DESCRIPTION` also needed the new type (typecheck).
The "still planned" row uses the existing `list()` helper, which prints "None" for an empty list.
**Gate:** `pnpm run check -- documents.test content.test handlers.test` → shared 4, web 91 passed.
**Notes:** the clearance wording is placeholder clinical text for the dentist's review.

## Phase 9: 3-month recalls for high caries risk — 2026-10-04

**Steps completed:** 9.1, 9.2, 9.3
**Files changed:** `packages/shared/src/domain/recall.ts` (+ test), `apps/web/src/features/notes/mocks.ts`,
`apps/web/src/mocks/{seed,db,seed.test,handlers.test}.ts`, `apps/web/src/features/clinic/components/clinic-settings.tsx`,
`CONVENTIONS.md` (db key v21)
**Deviations from plan:** the plan left the high-risk handler test as a comment sketch; written in full (low-risk exam
→ `routine`, then a high-risk exam at a second visit → only `routine_high_risk`, due today + 3 months).
**Gate:** `pnpm run check -- recall.test seed.test handlers.test` → shared 13, web 94 passed.
**Notes:** seeded demo recall counts change (some 3-month items, more overdue), as intended by Q1.

## Phase 10: One-tap booking from the recall list — 2026-10-04

**Steps completed:** 10.1, 10.2, 10.3, 10.4
**Files changed:** `packages/shared/src/domain/appointments.ts` (+ test), `packages/shared/src/schemas/recall.ts`,
`apps/web/src/features/recalls/mocks.ts`, `apps/web/src/mocks/handlers.test.ts`,
`apps/web/src/features/appointments/components/appointment-form.tsx`, `apps/web/src/features/recalls/components/recall-list.tsx`
**Deviations from plan:** none
**Gate:** `pnpm run check -- appointments.test handlers.test` → shared 18, web 86 passed.
**Runtime (10.4, front desk, Sunday):** /recall → Book on "6-month recall for Cummerata, Noemie" opened with
Procedure "Oral examination", Dentist "Dr. Ana Reyes", Chair 1, 2026-10-05 08:00; one tap → toast "Appointment
booked", rows 15 → 14.
**Notes:** `DueItem.dentistId` is an additive response field derived on read (NestJS must derive it the same way).

## Phase 11: Pre-treatment message — 2026-10-04

**Steps completed:** 11.1, 11.2
**Files changed:** `packages/shared/src/domain/messages.ts` (+ test), `apps/web/src/mocks/outbox.ts`,
`apps/web/src/features/messages/components/message-log.tsx`, `apps/web/src/mocks/handlers.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check -- messages.test handlers.test` → shared 7, web 87 passed.
**Notes:** a move re-queues it and a no-show withdraws it through the existing `cancelQueued` / `queueBookingMessages`
paths (appointments/mocks.ts:99-100, 119). The pre-treatment wording still needs the dentist's review.

## Phase 12: PDF uploads — 2026-10-04

**Steps completed:** 12.1, 12.2, 12.3
**Files changed:** `packages/shared/src/domain/photos.ts` (+ test), `apps/web/src/features/photos/{mocks,api}.ts`,
`components/{upload-photo-dialog,photos-tab,file-card}.tsx` (file-card new), `apps/web/src/features/portal/components/portal-uploads.tsx`,
`apps/web/src/mocks/handlers.test.ts`
**Deviations from plan:** the form-side check is a `superRefine` on each form schema (staff dialog and portal), not
inside the picker's `pick` handler, so the reason shows under the file field like every other field error.
The portal labels say "Photo or PDF" / "Choose a photo or a PDF".
**Gate:** `pnpm run check -- photos.test handlers.test` → shared 5, web 89 passed; eslint clean on photos and portal.
**Runtime:** parent uploads a PDF lab result → toast, file card with Open/Download; "Photo of teeth" + PDF → "Attach an
image file" under the field. Dentist uploads a referral PDF (Sep 20) and an intraoral PNG (Sep 25) unlinked → "Not
linked to a visit" shows date headings Sep 25, 2026 then Sep 20, 2026 (Phase 7 check); the PDF shows as a file card.

## Phase 13: Deposits — contract, domain, API — 2026-10-04

**Steps completed:** 13.1, 13.2, 13.3, 13.4, 13.5
**Files changed:** `packages/shared/src/schemas/{billing,finance}.ts`, `packages/shared/src/domain/{money,finance}.ts` (+ tests),
`apps/web/src/features/billing/{mocks,api}.ts`, `apps/web/src/mocks/{access,seed,handlers.test}.ts`,
`apps/web/src/features/billing/components/{payment-dialog,collections-list}.tsx`,
`apps/web/src/features/documents/components/document-options.tsx`
**Deviations from plan:**
- `mocks/seed.ts` picked payment methods with `PaymentMethod.options[i % length]`; adding `account_credit` would have
  re-rolled seeded methods (and seeded transfers). Switched to `MONEY_METHODS`, so seeded payments are unchanged and
  no db key bump is needed. The plan didn't list this.
- `financeSummary.byMethod` iterates `MONEY_METHODS` (not `PaymentMethod.options`), so the method chart never shows a
  "From deposit" bar; its total still equals `collected.month`.
**Gate:** `pnpm run check -- money.test finance.test handlers.test` → shared 15, web 91 passed; full check green.
**Notes:** Contract change (flagged): `Payment.invoiceId` optional, `PaymentMethod.account_credit`, `Payment.appliedTo`,
`FinanceSummary.depositsHeld`, `POST /patients/:id/deposits`, `POST /invoices/:id/apply-credit` (+ RULES). No UI yet.

## Phase 14: Deposits — screens, receipts, dashboard, portal — 2026-10-04

**Steps completed:** 14.1, 14.2, 14.3, 14.4
**Files changed:** `apps/web/src/features/billing/api.ts`, `components/{billing-tab,payment-dialog,apply-credit-dialog,collections-list,receipt}.tsx`
(apply-credit-dialog new), `billing/receipt-rows.ts`, `apps/web/src/features/documents/{content.ts,content.test.ts,mocks.ts,components/document-options.tsx}`,
`apps/web/src/features/dashboard/components/finance-dashboard.tsx`, `apps/web/src/features/portal/components/{portal-records,portal-home}.tsx`
**Deviations from plan:**
- `paymentKind` is named `paymentLabel` and returns a full label for every row ("Cash payment", "GCash refund", "Cash
  deposit", "Paid from deposit", "Applied to an invoice"…); the collections Method column reuses it.
- The invoice "Refund" action now shows only when real money (not applied deposit) was paid on it, matching the
  server's cap. Identical for invoices without applied credit.
- `documents/mocks.ts`: the receipt source check also requires `isMoneyIn`, so the API never issues an acknowledgment
  receipt for a CR transfer row (the plan only hid them in the picker).
- Finance strip is 5 columns at lg; "Deposits held" spans the second column on phones so the 2-column strip has no
  empty cell. It is always shown (₱0.00 when none).
**Gate:** full `pnpm run check` → shared 129, web 202 passed; `pnpm lint` 0 errors (1 pre-existing warning).
**Runtime (admin, then parent in the same browser data):** Noemie → Take deposit ₱1,000 → "Deposit recorded · receipt
AR-000069"; statement adds Deposit on account ₱1,000 / Due after deposit ₱0.00. Pay from deposit on the first
invoice with a ₱500 balance (prefilled ₱500 = min(deposit, balance)) → Paid ₱3,700 → ₱4,200, Balance ₱900 → ₱400,
deposit ₱500.
Deposit receipt: "For: Deposit on account", "Deposit after this ₱1,000.00". /billing: deposit row present, no "From
deposit" row. Dashboard: Deposits held ₱500.00. Parent portal: "Deposit on account ₱500.00", "Deposit paid October 4,
2026"; home "₱500.00 on deposit".

## Not implemented (by decision)

- "Booked from" label on agenda rows and calendar tiles (plan: optional, deferred).
- Merging the pre-treatment and reminder SMS into one (plan: deferred).
- Clinic wording for dental clearance and pre-treatment still needs the dentist's review.

## Tester follow-ups — 2026-10-05

**Steps completed:** two minor notes from the tester run
**Files changed:** `apps/web/src/mocks/seed.ts`, `apps/web/src/mocks/db.ts`, `CONVENTIONS.md`, `apps/web/src/features/growth/components/growth-card.tsx`
**Deviations from plan:** none (fixes outside the plan's steps, prompted by the tester)
**Gate:** `pnpm run check` — shared 129, web 202 passed; `pnpm lint` 0 errors (1 pre-existing warning)
**Notes:**
- Growth off-by-one: seeded visit `date` is a UTC day, while `completedAt` could fall on the next Manila day, so an inferred stop cited "Sep 30" for a Sep 29 visit. `seedGrowth` now sets `recordedAt` to noon (Manila) of `v.date`. Runtime visits already use the local day (`features/visits/mocks.ts`). DB key bumped to v22.
- A growth record with no habits and no speech now reads "No habits noted" in the timeline.
- Dental clearance, empty "Cleared for" on Download: verified in the browser that the field shows "Say what the child is cleared for, e.g. school enrolment or surgery" with `aria-invalid`. No change needed.

## Auditor follow-ups — 2026-10-05

**Steps completed:** the five Low findings from the audit (76/100, all 41 steps traced)
**Files changed:** `apps/web/src/features/billing/components/billing-tab.tsx`, `apps/web/src/features/billing/components/receipt.tsx`, `apps/web/src/mocks/handlers.test.ts`
**Deviations from plan:** label wording, recorded now; it was chosen during Phase 14 but not logged then:
- The invoice action reads "Pay from deposit", not "Apply deposit". It names what happens from the payer's side and pairs with "Return to deposit".
- The apply dialog's staff field reads "Done by", not "Received by", because no money is received in a transfer.
- The portal reads "Used for the bill of {date}" and "Paid from your deposit", not "Used for invoice of {date}" and "From deposit". This is parent-facing plain wording.
**Gate:** `pnpm run check` + `pnpm lint` (see below)
**Notes:**
- The Statement grid keeps its original `grid-cols-3` for families with no deposit rows. The responsive 5-column grid applies only once deposits exist, so existing statements look as before.
- The receipt page now refuses `account_credit` rows (`isMoneyIn`), matching the history list, the PDF picker and the documents API. A hand-typed CR URL shows "This receipt doesn't exist".
- New test: with ₱1,300 held, applying ₱900 to an ₱800 invoice is refused (409). This exercises the over-balance guard.
- New test: moving an extraction cancels the old pre-treatment message and queues one for the new day; a no-show withdraws it.
