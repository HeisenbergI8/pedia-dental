# Implementation log: revised tiers, SMS top-ups and the Plans page

## Phase 1: Shared domain — labels, limits, feature flags, messages — 2026-11-19

**Steps completed:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
**Files changed:** `packages/shared/src/domain/{tenancy,allowance,sending,signup}.ts` and their tests;
`packages/seed/src/seed.test.ts`; `apps/api/src/clinic/limits.test.ts`; `apps/api/src/reports/report-branches{,.test}.ts`;
`apps/web/src/mocks/access.ts`; `apps/web/src/mocks/{owner-settings,allowances,signups}.test.ts`;
`apps/web/src/features/clinic/components/settings.test.ts`; `apps/api/test/int/{owner-settings,clinic-branding,allowances,signups,subscriptions,finance,today}.int.test.ts`;
`apps/api/test/port-ledger.ts`; `apps/web/e2e/{api-demo-script,api-owner-settings,plan-limits.mobile}.spec.ts`; `DEMO_SCRIPT.md`.
**Deviations from plan:**
- `TIER_SUPPORT.detail` carries no reply-time promise (decision 26), so Starter reads "Email us, plus help setting up."
- The cross-branch refusal ("Reports across branches come with the Mid and Big plans") was a hard-coded label in
  `report-branches.ts` and `mocks/access.ts`, which the plan missed. It now names the Clinic and Pro plans.
- `seed.test.ts` asserted Ngiti "exactly at its limits". It now asserts 1 of 1 branch and 5 of 10 logins (D19).
- The client demo script's step 5 and three e2e specs showed Ngiti full at 5 of 5 staff, which D19 makes untrue.
  They now show Ngiti's branch limit (1 of 1, Add branch off), which still demonstrates a refusal.
- `allowances.int.test.ts` filled storage with one row, but `StoredFile.bytes` is a 32-bit column and 25 GB doesn't
  fit. The filler is now rows of at most 1 GiB. Real uploads are unaffected.
- The `signups` mock test now checks the design add-on through a Clinic sign-up, since Pro includes it.
**Gate:** `pnpm run check` green; `pnpm test:int` for owner-settings, clinic-branding, subscriptions, finance, today,
allowances and signups green (MySQL in Docker).
**Notes:** the remaining e2e specs (`operator`, `owner`, `plan-limits`, `signup.mobile`, `owner.mobile`,
`operator.mobile`, `api-demo-script` labels) still name Small/Mid/Big, the old 20-login count and the old prices. They
get one sweep after phase 3, which changes the prices.

## Phase 2: Feature locks per tier — 2026-11-19

**Steps completed:** 2.1, 2.2, 2.3, 2.4 (nothing to do: no letterhead lock), 2.5, 2.6, 2.7
**Files changed:** `packages/shared/src/domain/tenancy.ts` (`REQUESTS_NOT_ON_PLAN`);
`apps/api/src/appointments/appointment-requests.service.ts`; `apps/web/src/features/appointments/mocks.ts`;
`apps/web/src/features/portal/components/portal-appointments.tsx`; `apps/web/src/features/clinic/components/plan-panel.tsx`;
`apps/web/src/features/signup/components/signup-fields.tsx`; `apps/web/src/mocks/tenancy.test.ts`;
`apps/api/test/int/appointment-requests.int.test.ts`.
**Deviations from plan:**
- The portal shows the refusal inside a "Request an appointment" card rather than a bare paragraph, and shows
  nothing until the clinic's plan has loaded, so a Clinic-plan parent never sees the Starter text flash first.
- The mock test lives in `mocks/tenancy.test.ts` (cross-account cases), since `mocks/portal.test.ts` doesn't exist. Its
  API twin has the identical title, so the port ledger matches it without an entry.
- The sign-up hint for "Design it for me" reads "included on the Pro plan" rather than "Included on Pro".
**Gate:** `pnpm run check` green; `pnpm test:int test/int/appointment-requests.int.test.ts` green (9).
**Notes:** `grep -rl TIER_LIMITS apps/api/src` lists only appointments, clinic, message-queue, operator, reports and
storage: no clinical service reads a tier. No e2e spec has a Ngiti parent request an appointment.

## Phase 3: Price list and support data — 2026-11-19

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5
**Files changed:** `packages/shared/src/schemas/{signup,tenancy}.ts` (`TextPackPrice`, `SupportSettings`,
`SupportContact`, `ClinicSupportView`); `packages/shared/src/domain/tenancy.ts` (`clinicSupportView`);
`packages/seed/src/{seed-signups,platform}.ts`; `apps/api/prisma/schema.prisma` and migration
`20261119030723_text_pack_and_support`; `apps/api/src/platform-settings/{platform-settings.service,support.controller,platform-settings.module}.ts`;
`apps/api/src/seed/seed-database.ts`; `apps/api/src/auth/access-rules.ts`; `apps/web/src/features/operator/{signup-mocks,mocks}.ts`;
`apps/web/src/features/clinic/mocks.ts`; `apps/web/src/features/operator/components/price-list-screen.tsx`;
`apps/web/src/mocks/{access,passthrough,db}.ts` (key v33); tests: `mocks/{operator,passthrough}.test.ts`,
`apps/api/test/int/{operator-console,tier-limits}.int.test.ts`, `apps/api/test/operator-audit-coverage.test.ts`,
`packages/shared/src/domain/{signup,subscription}.test.ts`.
**Deviations from plan:**
- Five support routes rather than three: the console also needs to read what it set, so `GET /operator/support` and
  `GET /operator/accounts/:id/support-contact` sit beside the two PUTs. All five go in one `SupportController` in
  the platform-settings module, the only reader and writer of PlatformSettings.
- The migration's name has Prisma's own timestamp (`20261119030723_…`), not the plan's `20261119000100_…`.
- The mock keeps Pro contacts in `Platform.supportContacts` (by clinic id) rather than on `ClinicAccount`, so the
  shared `ClinicAccount` schema, which staff read, doesn't gain them.
- `/clinic/support` shows the chat link on Clinic and Pro, the named contact only on Pro, and the email on every
  plan (`clinicSupportView`).
- The price form's "Design it for me" card now says Pro includes it.
- `tier-limits.int.test.ts` (the race tests) fills Ngiti to 10 logins first, per D19.
**Gate:** `pnpm run check` green; full `pnpm test:int` green apart from one ordering flake in
`patients-write.int.test.ts`, which passed on re-run and is not touched by this work.
**Notes:** the operator audit coverage count went from 16 to 18 mutations (the two support saves). The e2e sweep for
labels and prices went to a helper agent working only in `apps/web/e2e`.

## Phase 4: Top-up contract and the MSW mock — 2026-11-19

**Steps completed:** 4.1, 4.2, 4.3, 4.4, 4.5
**Files changed:** `packages/shared/src/schemas/{payments,subscription,tenancy}.ts` (`ReceiptView.packs/parts`, the
`text_topup` payer, `TextTopUpInput`, `TOPUP_PAUSED`, `TextTopUp`, `TextTopUpsView`, `SubscriptionView.topUps`,
`ClinicUsage.textTopUp`); `packages/shared/src/domain/{allowance,subscription}.ts` (`textTopUpQuote`, `textTopUpLine`);
`packages/seed/src/{platform,seed-receipts}.ts`; `apps/web/src/mocks/{text-topups (new),receipts,subscriptions,allowances,outbox,access,passthrough}.ts`;
`apps/web/src/features/clinic/mocks.ts`; `apps/api/src/auth/access-rules.ts` (the two routes);
tests: `mocks/{payments,allowances,operator,passthrough}.test.ts`, `features/clinic/components/settings.test.ts`.
**Deviations from plan:**
- `ReceiptView` carries `packs` as well as `parts` (the plan had `packs` only on the stored receipt), so the Owner's
  card can say "2 packs".
- To avoid an import cycle, `mocks/text-topups.ts` holds only the platform records (`nextInvoiceNo`, `topUpPartsIn`,
  `topUpsOf`, `recordTopUp`). The receipt upload (`addTopUpReceipt`) and `textTopUpsView` sit in `mocks/receipts.ts`
  beside `addClinicReceipt`. `nextInvoiceNo` moved there from `subscriptions.ts` and now counts top-ups (the plan's trap).
- `TextTopUp` and `TextTopUpsView` live in `schemas/subscription.ts`: `signup.ts` imports `payments.ts`, so
  `payments.ts` can't import `TextPackPrice` without a cycle.
- The mock db key was bumped once, to v33, in phase 3 (it covers both phases).
- Payments to check sorts waiting top-ups first (D14) in the mock now; the API's sort comes in phase 5.
**Gate:** `pnpm --filter web typecheck` and the full web suite (418) green, plus the 39 tests in the four touched mock
files. The repo-wide typecheck is red only in `apps/api` until phase 5 adds the API side, so phases 4 and 5 share one
full gate.
**Notes:** the e2e sweep (helper agent) changed `plan-limits`, `signup`, `signup.mobile`, `operator`, `operator.mobile`,
`owner`, `owner.mobile` and `api-demo-script` specs to the new labels, counts and prices. Nothing was run. Ipin is
assumed to have 1 staff login; its boundary test now adds 9.

## Phase 5: API — top-ups end to end — 2026-11-19

**Steps completed:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
**Files changed:** `apps/api/prisma/schema.prisma` and migration `…_text_topups` (enum value, `PaymentReceipt.packs/parts`,
`TextTopUp`); `src/prisma/model-scope.ts` (platform scope, append-only); `src/privacy/{retention-schedule,clinic-data}.ts`
(Primolar's books, kept on purge); `PRIVACY_OPERATIONS.md` (regenerated inventory); `src/receipt-records/{receipt.rows,receipt-records.service}.ts`;
`src/text-topups/{service,controller,module}.ts` (new); `src/clinic/account-lock.ts` (`lockAccountById`);
`src/subscription-records/{invoice-counter.ts (new),subscription-records.service.ts,subscription-records.module.ts}`;
`src/operator/{operator-receipts.controller,operator.module,account-overview}.ts`; `src/usage/usage.service.ts`;
`src/clinic/{limits,clinic.service}.ts`; `src/message-queue/message-send.handler.ts`; `src/seed/seed-database.ts`;
`src/app.module.ts`; tests `test/int/{text-topups (new),allowances}.int.test.ts`, `src/clinic/limits.test.ts`.
**Deviations from plan:**
- The send claim and `UsageService` read top-up parts directly (one aggregate in the claim, one more `GROUP BY` beside
  the usage's other measures) rather than through `TextTopUpsService.partsIn`. That keeps the message-queue and usage
  modules free of a new import. `partsIn` serves the Owner's top-up view.
- D8 refuses on any subscription pause (overdue or cancelled), as the mock does, rather than only `overdue`.
- The access rule for `POST /clinic/text-topups/receipts` carries no `audit` field on the API side (the API's rule
  type has none); the service records the audit itself, as the subscription upload does.
- The confirm-versus-send race is covered by design rather than by a test: both take the account lock. The upload race
  is tested.
- No demo-reset change was needed: the int tests truncate every table, and the demo reset re-seeds through
  `seedDatabase`.
**Gate:** `pnpm run check` green; full `pnpm test:int` green (60 files, 660 tests).

## Phase 6: Web UI — top-ups, payment history, support — 2026-11-19

**Steps completed:** 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
**Files changed:** `apps/web/src/features/clinic/{api.ts,primolar-invoice.ts}`;
`apps/web/src/features/clinic/components/{text-topup-card (new),contact-support (new),plan-panel,usage-banner,payment-history}.tsx`;
`apps/web/src/features/operator/api.ts`; `apps/web/src/features/operator/components/{support-cards (new),account-detail,accounts-screen,payments-screen,price-list-screen}.tsx`;
`CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `ROADMAP.md`.
**Deviations from plan:**
- The pack picker is a labelled number input (1–20) beside "= N texts for ₱X"; it isn't a separate `PackPicker`
  component, since it has one caller.
- The text notice's link now reads "Buy more texts" everywhere. In the top banner it goes to
  `/settings?tab=plan#buy-texts`; on the Plan screen it jumps to the card. Both are Owner-only already (the banner and
  the Plan tab need `clinic.manage`), so no `<Can>` was added. The old "See Settings → Plan" wording of this notice is
  gone; the billing banner keeps its own link.
- The console shows the support level as plain text in its own "Support" column, not a badge, keeping the list calm.
  The account detail's Plan card gets a "Support" row, plus a Support contact card on every plan (kept for an upgrade).
- Primolar's support email and chat link are edited on the console's Price list page, under the payment QR card.
- `TIER_SUPPORT.detail` has no reply-time promise (decision 26).
**Gate:** `pnpm run check` green. Seen in the browser against the real API (Ngiti's Owner, Settings → Plan): the
Starter labels and limits (5 of 10 logins, 0 MB of 25 GB, 0 of 500 texts), the support row and its dialog (no
details set yet: plain "not added yet" text), the feature list, the "Buy more texts" card, and Starter at ₱15,000.00
with ₱1,607.14 VAT.
**Not verified visually:** the top-up receipt upload (no payment QR is set in the local database, so the upload
form doesn't show, as for the monthly payment), the console's new cards, and dark mode. Left for the tester.

## Phase 7: The public Plans page and its PDF — 2026-11-19

**Steps completed:** 7.1, 7.2, 7.3, 7.4
**Files changed:** `apps/web/src/features/plans/{plans-content.ts,plans-content.test.ts,download.ts}` and
`components/plans-screen.tsx` (all new); `apps/web/src/app/plans/page.tsx` (new);
`apps/web/src/features/signup/components/{signup-frame,signup-fields}.tsx`; `apps/web/src/features/clinic/components/plan-panel.tsx`.
**Deviations from plan:**
- No new react-pdf file. The PDF is a `DocContent` built from the same `PlansContent` and saved through the existing
  `downloadPdf` (Noto Sans, the dynamic import, `saveFile`), with Primolar's letterhead as on its invoices. Lean, and it
  keeps the CONVENTIONS PDF traps in one place.
- `SignupFrame` gained `wide` (max-w-6xl) so the three plans sit side by side; the forms keep the narrow column.
- The "Most popular" column is outlined (`border-brand-ring`) rather than tinted. The design guard
  `design-sweep › selection is neutral` refuses a conditional `bg-brand-subtle`, and the guard is right to stay. The
  card itself keeps the draft's brand border, badge and filled button.
- The headline uses the app's title font, not Fredoka: the design guard keeps Fredoka to the login and portal.
- Plan cards link to `/get-started` without preselecting the plan. Preselecting would need `useSearchParams` and a
  Suspense boundary on Get started. Left as a possible follow-up.
- The Data Privacy Act answer only says what the app does. A code comment marks it "confirm with counsel"; nothing on
  the page says so.
- `/plans` is indexable (decision 23), with title "Primolar plans".
**Gate:** `pnpm run check` green (with `plans-content.test.ts`: prices from the list, limits from TIER_LIMITS, support
from TIER_SUPPORT, Clinic popular, section order). Seen in the browser: the page loads with ₱15,000 / ₱24,999 /
₱44,999 from the API, equal-height cards, and "Download as PDF" builds without an error. A duplicate React key in the
PDF's highlight rows was found and fixed.

## Phase 8: Custom letterhead on Clinic and Pro — 2026-11-19

**Steps completed:** 8.1, 8.2, 8.3, 8.4, 8.5
**Files changed:** `packages/shared/src/schemas/tenancy.ts` (`LetterheadMode`, `UpdateLetterheadInput`, `LetterheadSettings`);
`packages/shared/src/domain/letterhead.ts` (new) and `index.ts`; `packages/shared/src/schemas/payments.ts`
(`imageProblem` names the rules' own types); `packages/seed/src/platform.ts` (`Db.letterhead?`);
`apps/web/src/features/clinic/{mocks.ts,api.ts}`; `apps/web/src/features/clinic/components/{letterhead-card (new),settings-screen}.tsx`;
`apps/web/src/features/documents/{content,api,download}.ts` and `components/{document-pdf,document-preview}.tsx`;
`apps/web/src/mocks/{db (v34),access,passthrough,passthrough.test,owner-settings.test}.ts`; `CONVENTIONS.md`.
API (helper agent): `apps/api/prisma/schema.prisma` and migration `20261119034744_custom_letterhead` (add-only);
`apps/api/src/clinic/{letterhead.ts,letterhead.service.ts,letterhead.controller.ts}` (new) and `clinic.module.ts`;
`src/prisma/model-scope.ts`; `src/privacy/retention-schedule.ts`, `clinic-data.test.ts`; `apps/api/src/auth/access-rules.ts`;
`test/clinic-routes.test.ts`; `test/int/owner-settings.int.test.ts`; `apps/api/CONVENTIONS.md`; `PRIVACY_OPERATIONS.md`.
**Deviations from plan:**
- Uploading an image switches the letterhead to "image"; removing it goes back to "standard" (when the image was in
  use). A text letterhead keeps its lines when an image is removed.
- `GET /clinic/letterhead/image`: the mock streams the blob, the API answers 302 to a 5-minute link (as photos and
  receipts do; the logo streams). Browsers follow either.
- Letterhead writes are not audited, matching the logo's writes (neither side audits them).
- The image's old ledger row is deleted in the write's transaction (the file deletion is queued), so storage drops at
  once, as the mock does. The logo waits for the outbox.
- The "Your own image" choice needs an upload; until then nothing changes. A saved image can be picked again from text
  or standard with "Save letterhead".
- `imageProblem` now names the rules' own types ("Choose a PNG or JPG image" for letterheads), and the receipts and QR
  keep "PNG, JPG or WebP".
- The dentist line's hint carries decision 25's note (the signature still names the issuer).
**Gate:** `pnpm run check` green; full `pnpm test:int` green (60 files, 663 tests).
**Not verified visually:** the Letterhead card and a document with a custom letterhead (left for the tester).

## Tester findings and fixes — 2026-11-19

**Tester verified:** `pnpm run check`; full `test:int` (60 files, 663 tests); production build; Playwright `plan-limits`,
`owner`, `operator` and `signup` on an MSW build (177 of 178). On the real API: QR upload, pack limits, one pending
receipt at a time, reject with a reason, and confirm raising Ngiti's texts from 500 to 700 (`TextTopUp` `PRM-INV-00001`).
Also support channels per plan, a text letterhead on a document preview and PDF, the letterhead image counted in
storage then removed, and Starter refusals.
**Fixed after testing:**
- Bug: the support chat link accepted `javascript:` URLs, which the Owner's dialog rendered as a link. `SupportSettings`
  now accepts https only, and the dialog makes only https links clickable. Twin tests added (mock and API: 400).
- Stale e2e: `signup.spec.ts` "a whole sign-up can be filled and sent with the keyboard only" now tabs through the new
  "Compare plans" link before the plan choice.
- An unused `primolarInvoiceNo` import left in `mocks/subscriptions.ts`.
**Gate after fixes:** `pnpm run check` green; full `pnpm test:int` green (60 files, 663 tests).
**Not verified by the tester:** the top-up in the Owner's payment history and its Acknowledgment PDF, Payments to check
ordering in the UI, `/plans` and its PDF in the browser (checked by the implementer in phase 7), the parent portal's
"please call" text, Pro's named contact, 375 px and dark mode. The local real-API databases were seeded before this work
(old prices, no subscriptions), which blocked some screens. A fresh seed has the new data.
**Left behind by the tester:** test data in the e2e database `pedia_dental_e2e` (QR, top-up receipts, one `TextTopUp`,
support settings, a Bulilit text letterhead, one issued document). It holds no real data; reseed it to clear.
`apps/web/test-results/` is git-ignored.

## Audit fixes — 2026-11-19

The auditor scored 70/100. Every finding is fixed:
1. **High: image letterheads missing from production PDFs.** `GET /clinic/letterhead/image` now streams the file from
   the API's own origin like the logo (`letterhead.controller.ts`, `LetterheadService.imageFile`), not a 302 to S3.
   The PDF's canvas can then draw it without CORS on the bucket. The int test asserts 200 with the bytes and no redirect.
2. **Demo script:** step 4 now reads "5 of 30 staff logins" on the Clinic plan; step 5 no longer tells the presenter to
   archive Ngiti's only branch (the app refuses), and says an upgrade to Clinic opens two more branches.
3. **Missing items, now delivered:**
   - The Letterhead card shows a live `DocumentPreview` of a sample certificate with the draft letterhead (8.5).
   - The console shows "+N bought" beside the texts; `AccountOverview.usage` gained `textTopUp` on both sides (6.3).
   - Tests, mock and API twins with identical titles:
     - a monthly receipt can be sent while a top-up waits (decision 21)
     - a top-up is confirmed at its quoted pack price after the price changes (D3)
     - a top-up counts only in its own month (D1)
   - A `payerOf`/`payerWhere` unit test (5.6).
   - An invoice-label and `textTopUpLine` test (1.5).
   - CONVENTIONS: db key v34, the console row, and the API's top-up lock order.
4. **Low:** a paused clinic's text notice now says "Pay your monthly fee first, then buy more texts." instead of a dead
   "Buy more texts" link.
5. **Smells:**
   - Five doc comments moved back above their own declarations.
   - `SubscriptionRecordsService.nextInvoiceNo` removed (it only delegated); `invoice-counter.ts` is called directly.
   - One `ComparePlansLink` component instead of three copies.
   - A shared `YearMonth` schema.
   - The Plans page reads `GRACE_DAYS`.
   - Left as is: "GCash, Maya or bank QR" stays as marketing copy.
**Gate:** `pnpm run check` green; full `pnpm test:int` green (60 files, 666 tests).
**Not verified visually:** the Letterhead preview and the paused note. The browser holds the tester's httpOnly
`pd_session` from the real API on another localhost port, which blocks the demo sign-in; clear localhost cookies to
look.
