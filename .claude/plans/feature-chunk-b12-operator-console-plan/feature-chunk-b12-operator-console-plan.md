# Plan: Chunk B12: operator console, sign-ups and subscriptions

## 1. Plan Overview

- **Plan Type:** feature
- **Description:** Primolar runs its own business on the API. The whole operator console (accounts, tiers, Owners,
  suspend and reactivate, Design it for me branding, usage, the price list), the public sign-up (multipart form, status
  by reference, fix, reject, approve → `createClinic` in **one** transaction) and each clinic's subscription move from
  MSW to MySQL. New in B12, designed in the mock first: Primolar's payment QR (decisions 5, 23), receipt screenshots
  from the Owner (Settings → Plan) and from a sign-up (its status page) that the operator confirms or rejects from a
  "Payments to check" list (6–8, 21, 22, 24), price changes that reach existing clinics only from their next due date
  (11), downgrades refused while over the smaller plan (12), storage and SMS allowances per plan with the Owner's 80% /
  100% warnings (1–3, 16–20), rejected sign-ups' files deleted after 30 days (15), at most 5 sign-ups per hour per
  address (14). Overdue clinics pause through a **nightly job plus a check at sign-in** (4), never per request.
  Written as a spec per step (files, signatures, tables, route contracts, lock order, tests), not as full diffs: the
  B11 plan's diffs cost its run. Only the genuinely tricky parts carry code.
- **Date:** 2026-10-18

### Starting state

Branch `feature/b12-operator-console`, B1–B11 merged, `decisions.md` settled (24 decisions). Verified in code
(reviews in `references/`):

- **The mock already has the console and sign-ups** (the spec): `features/operator/mocks.ts` (accounts, create, tier,
  subscription, payments, cancel, suspend, reactivate, staff, owner, branding), `features/operator/signup-mocks.ts`
  (list, files, fix, record payment, reject, approve, prices), `features/signup/mocks.ts` (public prices, submit,
  status), `mocks/signups.ts` (`readSignupForm`, `duplicateOf`, `addSignup`, `statusView`, `createClinic`),
  `mocks/subscriptions.ts` (`settleSubscriptions` on every request from `mocks/access.ts:364`, `billedTier`,
  `recordSubscriptionPayment`, `changePlan`, `cancelSubscription`, `reactivateRefusal`, `subscriptionView`).
  `GET /clinic/subscription` is in `features/clinic/mocks.ts:90`.
- **Shared rules exist:** `domain/signup.ts` (`amountDue`, `vatPart`, `sameClinicName`, duplicate wording,
  `referenceImagesProblem`), `domain/subscription.ts` (`subscriptionDueOn`, `subscriptionStatus`, `GRACE_DAYS`,
  `isTierUpgrade`, `primolarInvoiceNo`), `domain/tenancy.ts` (`TIER_LIMITS` = branches, staffLogins, crossBranchViews
  only; `accountUsage`, `limitMessage`). Schemas: `schemas/signup.ts`, `schemas/subscription.ts`, `schemas/operator.ts`,
  `ClinicUsage` in `schemas/tenancy.ts:92` (branches and staff logins only).
- **The API has none of it:** only `/operator/auth/*` (`operator-auth.controller.ts`), `GET /clinic/usage`
  (`clinic/limits.ts`: `countUsage`, `usageOf`, `assertRoomFor`), every operator and public sign-up rule already in
  `auth/access-rules.ts:104-131`, and the tables `OperatorUser`, `OperatorSession`, `ClinicAccount`, `Agreement`. No
  Signup, Subscription, price or receipt table. `MODEL_SCOPE`'s comment already names "sign-ups, prices,
  subscriptions" as platform.
- **Storage:** `StorageService` keys are `clinics/<clinicId>/<area>/<name>.<ext>` only (`storage.ts:15-27`), every
  put writes the `StoredFile` ledger, `usedBytes()` sums it (counted, never limited). `storage.ts:3` already says
  "B12's sign-up files need a platform area". `readUpload` takes **one** `file` part (`multipart.ts:19-30`); the
  sign-up form has `logo` + up to 3 `reference`. `LocalDiskStorage.link` re-parses the key with `parseKey`.
- **Texts:** `MessageQueueService.sentIn(month)` sums `segments` by `sentAt` (`message-queue.service.ts:145-152`);
  `MessageSendHandler.handle` claims under `SELECT … FROM Message … FOR UPDATE` as its first statement
  (`message-send.handler.ts:42-66`); `FAILURE` lives in `domain/sending.ts:35`. The mock never sends (`mocks/outbox.ts`).
- **Rate limits:** `RATE_LIMITS = { login, auth, reset }`, `hitRolling(bucket, limit)` from B11 (`rate-limit.ts:16-22,74`).
- **Jobs:** `JobRunner.run(job, fn)` runs `fn` in a context **without** a clinic (`job-runner.ts`); crons live in
  the owning module (`messages.jobs.ts` pattern, `timeZone: "Asia/Manila"`).
- **Sign-in** refuses staff of a non-active account after the password (`auth.service.ts:73-76`,
  `identity.service.ts:95-101`); that is where the sign-in settle check goes.
- Mock db key `pedia-dental:mock-db:v30` (`mocks/db.ts:11`). `Platform = { accounts, tenants, signups, prices,
  subscriptions, agreements }` (`packages/seed/src/platform.ts:92-98`).

### Sub-chunks (each phase ends with `pnpm run check` green; from Phase 5 on also `pnpm --filter api test:int`)

| Sub-chunk | Phases | What it delivers |
| --- | --- | --- |
| **B12a** Contract, seed and the mock | 1–2 | Allowances, price history, receipts and QR schemas and rules; seeded QR-less platform, a pending receipt; the MSW routes (the spec) |
| **B12b** Web | 3 | Pay by QR + receipt upload on Settings → Plan and the sign-up status page; Payments to check; the QR card; usage and the text warning |
| **B12c** API | 4–8 | Tables, migration, API seed; platform files and multi-part uploads; prices and QR; sign-ups and `createClinic`; subscriptions, receipts and both jobs; allowances (storage at upload, texts at send) |
| **B12d** Cut-over | 9 | `API_ROUTES`, `e2e/api-operator.spec.ts`, both CONVENTIONS, CHUNKS ✅ |

### Product decisions (settled in `decisions.md`, 2026-10-18; not re-asked)

1 storage 2 / 10 / 50 GB, refused at the limit, files stay · 2 texts 300 / 1,000 / 3,000 billed parts a month · 3 at
the limit automatic reminders stop, invites and resets still go, Owner warned at 80% and told at 100% · 4 nightly pause
7 days after due · 5 one QR, operator uploads and replaces it, optional caption · 6 Owner pays in Settings → Plan:
QR, amount, receipt image ≤ 5 MB, reference number; operator confirms or rejects with a reason · 7 the sign-up status
page takes the same receipt; confirmed before approval · 8 "Payments to check" count and list, no email · 9 invoice
stays the browser PDF · 10 one operator login · 11 new prices: new sign-ups at once, existing clinics from the next due
date · 12 downgrade refused while over the smaller plan · 13 cancelling by the operator, access ends with the paid month
· 14 ≤ 5 sign-ups per hour per address · 15 rejected sign-ups' files deleted 30 days after rejection · 16 storage
counts photos, documents, patient photos, logo; not receipts · 17 usage to the Owner and the operator · 18 the text
month is the Manila calendar month · 19 over-limit reminders logged "not sent", never sent later · 20 no extra
allowance · 21 a rejected receipt can be replaced · 22 no partial payments · 23 no QR yet → "Primolar will send you
payment details" · 24 receipts: the clinic's Owner and the operator only.

### Engineering decisions (recorded; open ones are in Follow Ups → Questions)

- **E1. One receipt table for both payers.** `PaymentReceipt { purpose: signup | subscription, signupId | clinicId +
  periodStart, amountDue, reference, fileKey, status: pending | confirmed | rejected, rejectionReason, uploadedAt,
  decidedAt }`. "Payments to check" is `status = pending`, oldest first. One pending receipt per payer at a time (a
  second upload while one is pending is 409); a rejected one can be followed by a new one (21). Confirming takes the
  **full** amount due (22): a subscription receipt confirms only while its `periodStart` is still the first unpaid
  month and the amount due is unchanged, else 409 and the operator rejects it.
- **E2. Platform files.** Sign-up files, receipts and the QR are Primolar's, not a clinic's: keys
  `platform/<area>/<uuid>.<ext>` with areas `signups`, `receipts`, `payment-qr`, built and checked only by a new
  `PlatformFilesService` (no `StoredFile` ledger row, so receipts never count toward storage: decision 16). Who may
  read is decided by the row that holds the key (the Owner's own clinic, the operator, the sign-up's reference), never
  by the key. The S3 IAM policy must add `platform/*` (B13 go-live list).
- **E3. Multi-part uploads.** `readUpload` grows into `readUploads(req, { parts: { logo: { max: 1, maxBytes }, reference:
  { max: 3, maxBytes }, file: … } })` → `files: Record<string, SpooledFile[]>`, every part spooled to its own temp
  file; `readUpload` stays as the one-`file` wrapper so B10 callers don't change. A body over the summed limits ×2 is
  refused before reading (E13 of B10).
- **E4. Prices: current + changes.** `PlatformSettings` (singleton row `primolar`) holds today's list; every `PUT
  /operator/prices` appends `PriceChange { on: today (Manila), before: the old list }`. A month starting on `periodStart`
  is billed at `priceOn(changes, current, periodStart)`: the list of the first change with `periodStart < on`, else
  today's. So an unpaid month that already began keeps its price, and the next due date onwards gets the new one
  (decision 11). Sign-ups keep their quote (A2, unchanged). Pure rule in `domain/subscription.ts`, used by mock and API.
- **E5. The settle step is one shared pure function.** `settleStep(sub, account, day)` → `{ tier?, status?, pause?,
  downgrade: null?, priceTier: null? }` (no mutation) in `domain/subscription.ts`; the mock's `settleSubscriptions`
  applies it per request (unchanged behaviour), the API applies it in the nightly job and at sign-in.
  `billedTier`, `nextBoundary` and `keepPriceFor` move to the same file as pure functions.
- **E6. Lock order** (new rows join the global order account → visit → patient → child rows → Message):
  **PlatformSettings ("the platform lock") → Signup → ClinicAccount → Subscription → PaymentReceipt → InvoiceCounter
  (always last)**. Every write that runs the duplicate check (submit, fix, approve, direct creation) and every price or
  QR write takes the platform lock first. Subscription writes (settle, record, confirm, change plan, cancel, suspend,
  reactivate) take the account, then the subscription. Receipt confirm/reject reads the receipt's payer outside the
  transaction (immutable, as B6 decision 3), then locks in the order above. The send handler takes the account before
  its `Message` row (E9).
- **E7. `createClinic` is one transaction**, inside `requestContext.within({ clinicId: newId })` so the tenant rows get
  `clinicData()`. Before it: new ids (cuid2), argon2 of the temporary password and PIN. Inside: the platform lock,
  the signup row, the duplicate check, then ClinicAccount, Agreement, Branch, Staff (Owner), Credential, Chair,
  Procedures, NoteTemplates, MessageTemplates, PrivacyNotice, the audit event, Subscription, its first payment and
  lines, the invoice number, the sign-up's approval. **After** commit: the logo copy (Use my own) from the sign-up's
  platform key into the clinic's `branding` area, then `logoRef` in a second small transaction; a failure is logged and
  leaves the clinic on the default look (the Owner can upload; the mock also copies after its push).
- **E8. Storage limit at the ledger, under the account lock.** `StorageService.store` reserves before it writes the
  file: `runInTransaction` → `lockAccount` → `usedBytes + bytes > TIER_LIMITS[tier].storageBytes` → 409
  `storageFullMessage(tier)`; else insert the `StoredFile` row; commit; then put the file; on a failed put remove the
  row (`keepIf` already removes on a later failure). The order flips from B10's file-then-ledger: a crash between now
  leaves an over-count, never an under-count, which is the safe side of a limit. Every clinic upload (logo, patient
  photo, clinical photos, the operator's branding logo, the approval's logo copy) passes here; the seed doesn't.
- **E9. Text allowance at the send claim.** The claim locks the account (`lockAccount`) **before** its `Message` row,
  writes `segments` (= `smsSegments(body)`) with `dispatchedAt`, and for a clinic template kind (`MessageKind`) whose
  parts would pass `TIER_LIMITS[tier].textParts` this Manila month fails it with `FAILURE.textLimit` ("Monthly text
  limit reached") and never sends it (19). Account texts (`portal_invite`, `password_reset`) count but always go (3; B11
  decision 21). Used parts = `SUM(segments)` of this clinic's rows with `dispatchedAt` in the month
  (`MessageQueueService.partsIn(month)`); a released claim clears `segments` with `dispatchedAt`. The mock decides at
  queue time instead (it never sends); same words, same kinds.
- **E10. Allowances are data.** `TIER_LIMITS` gains `storageBytes` (2, 10, 50 GiB as bytes) and `textParts` (300,
  1,000, 3,000). `ClinicUsage` gains `storage` and `texts` allowances plus `month` (`yyyy-MM`); `AccountOverview.usage`
  gains the same two. `textAllowanceNotice(texts, month)` gives the 80% warning and the 100% notice, word for word in
  both stores.
- **E11. Sign-up rate limit:** `RATE_LIMITS.signup = { hits: 5, windowSeconds: 3600 }` through `hitRolling` per client
  address, counted **before** the body is read; 429 "Too many sign-ups from this connection. Try again in an hour."
  Public receipt uploads get `RATE_LIMITS.receipt = { hits: 10, windowSeconds: 3600 }` the same way.
- **E12. Modules (each table one owner, no cycles):** `PlatformSettingsModule` (prices, QR; leaf) →
  `SubscriptionRecordsModule` (Subscription, payments, lines, InvoiceCounter; settle job) and `ReceiptRecordsModule`
  (PaymentReceipt; leaf) → `SignupsModule` (Signup, `ClinicFactory`, purge job) → `OperatorModule` (accounts, receipts
  desk) and `ClinicBillingModule` (`/clinic/subscription*`). `UsageModule` (leaf over `StorageService.usedBytes` and
  `MessageQueueService.partsIn`) feeds `/clinic/usage` and the console. `AuthModule` imports `SubscriptionRecordsModule`
  for the sign-in check.
- **E13. Downgrade checks against the waiting plan.** While a downgrade waits, `assertRoomFor` checks additions against
  the smaller of the current and the waiting plan, so a clinic can't drift back over the limits the downgrade was
  allowed under (Questions 2 confirms this reading of decision 12).

## 2. Comprehensive Plan by Phases

## B12a: Contract, seed and the mock

### Phase 1: The shared contract

#### Step 1.1: Allowances in `TIER_LIMITS`, the storage and text rules

**File:** `packages/shared/src/domain/tenancy.ts`, `packages/shared/src/domain/allowance.ts` (new), `packages/shared/src/domain/allowance.test.ts` (new), `packages/shared/src/domain/sending.ts`, `packages/shared/src/schemas/tenancy.ts`, `packages/shared/src/index.ts`, `apps/web/src/features/clinic/mocks.ts`, `apps/api/src/clinic/limits.ts`, `apps/api/src/clinic/clinic.service.ts` (the `/clinic/usage` caller; confirm the name)
**Verify:** `pnpm run check -- domain/allowance`

Storage and text allowances as data, the refusal and warning words, the Manila month, `ClinicUsage` widened.

Spec:

- `tenancy.ts`: `TierLimits` gains `storageBytes: number` and `textParts: number` (never null: every plan has both).
  `TIER_LIMITS.small = { …, storageBytes: 2 * GB, textParts: 300 }`, `mid = { 10 * GB, 1000 }`, `big = { 50 * GB,
  3000 }` (decisions 1, 2), with `GB = 1024 ** 3` exported from `allowance.ts`. Export the private `Allowance` schema
  from `schemas/tenancy.ts` (the console reuses it).
- `ClinicUsage` becomes `{ tier, branches, staffLogins, storage: Allowance, texts: Allowance, month }` where `month` is
  `z.string().regex(/^\d{4}-\d{2}$/)`, the Manila month the texts count covers (decision 18). `storage.inUse` is bytes,
  `texts.inUse` billed parts.
- `allowance.ts` (new, pure):
  - `formatStorage(bytes)`: `"350 MB"`, `"1.4 GB"`, `"50 GB"` (one decimal under 10 GB, none above; MB below 1 GB).
  - `storageFullMessage(tier)`: `` `Your clinic's storage is full: the ${TIER_LABEL[tier]} plan includes ${n} GB. Files already stored stay. Contact Primolar to upgrade to upload more.` ``
  - `storageRefusal(tier, usedBytes, addingBytes)`: the message when `used + adding > storageBytes`, else undefined
    (exactly at the limit is allowed).
  - `manilaMonth(day: IsoDate)` = `day.slice(0, 7)`. Takes the server's Manila **date** (`today()` in the mock,
    `Clock.today()` in the API), never a `Date`, so the browser's own zone can't move the month.
  - `textPartsRefusal(kind: LoggedMessageKind, usedParts, addingParts, limit)`: undefined for an account text
    (`isAccountText`, B11) whatever the count (decision 3); `FAILURE.textLimit` when `used + adding > limit`.
  - `textAllowanceNotice(texts: Allowance, month)`: `{ level: "limit", text }` at ≥ 100%:
    `` `You've used all ${limit} texts for ${October 2026}. Automatic reminders are not sent until 1 ${November}; portal invites and password resets still go. Contact Primolar to upgrade for more.` ``;
    `{ level: "warning", text }` at ≥ 80%:
    `` `You've used ${inUse} of your ${limit} texts this month. At ${limit}, automatic reminders stop until 1 ${November}.` ``;
    else undefined. December rolls to "1 January".
- `sending.ts`: `FAILURE.textLimit = "Monthly text limit reached"` (decision 19; the log shows the reason as written).
- Keep the tree compiling: the mock's `usage()` (`features/clinic/mocks.ts:45`) fills `storage` and `texts` with
  `inUse: 0` and `month: manilaMonth(today())` (Step 2.5 fills them for real); the API's `usageOf`
  (`clinic/limits.ts`) takes `extra: { storageBytes, textParts, month }` and its one caller passes
  `StorageService.usedBytes()`, `sentIn(month).segments` and `manilaMonth(clock.today())` (Step 8.3 replaces both with
  `UsageService`).
- `allowance.test.ts` asserts: the three plans' numbers; `storageRefusal` allows `used + adding === limit` and refuses
  one byte more; `textPartsRefusal` never refuses `portal_invite`/`password_reset` at 10× the limit, refuses a 3-part
  reminder at 298/300 and allows a 2-part one; `textAllowanceNotice` is undefined at 239/300, `warning` at 240, `limit`
  at 300 and 301, and says "1 January" for `2026-12`; `formatStorage` for 0, 1 MB − 1, 1.45 GB, 50 GB.

#### Step 1.2: Price history, the shared settle step, downgrade check

**File:** `packages/shared/src/domain/subscription.ts`, `packages/shared/src/domain/subscription.test.ts`, `packages/shared/src/schemas/subscription.ts`, `packages/shared/src/schemas/signup.ts`
**Verify:** `pnpm run check -- domain/subscription`

`priceOn`, `settleStep`, `billedTier`, `nextBoundary`, `downgradeProblem` as pure functions.

Spec:

- `schemas/signup.ts`: `PriceChange = z.object({ on: IsoDate, before: PriceList })` (E4: the list in force before `on`).
- `domain/subscription.ts` gains (moved from `mocks/subscriptions.ts`, made pure; the mock calls them in Step 2.3):
  - `unpaidFrom(sub)` = `subscriptionDueOn(sub.anchor, sub.paidMonths)`.
  - `billedTier(sub, accountTier, periodStart = unpaidFrom(sub))`: the mock's rule, with the account's tier passed in.
  - `nextBoundary(sub, day)`: the first due date on or after `day`.
  - `keptPrice(sub, tier, until)`: the `priceTier` to store, or undefined when one is set already or no unpaid month
    began before `until` (the mock's `keepPriceFor`, returning instead of mutating).
  - `priceOn(changes: readonly PriceChange[], current: PriceList, day: IsoDate): PriceList`: the `before` of the first
    change (in saved order) with `day < change.on`, else `current`. Two changes on one day: the first one's `before`
    wins, which is the list in force when that day began.
  - `monthlyFeeOn(changes, current, tier, periodStart)` = `priceOn(…).plans[tier].monthlyFee`.
  - `settleStep(sub, account: { tier; status }, day): SettlePatch`, where `SettlePatch = { tier?: Tier; status?:
    AccountStatus; pause?: SubscriptionPause | null; downgrade?: null; priceTier?: { tier; until } | null }` and `{}`
    means nothing to do. Same order and outcomes as `settleSubscriptions` today:

    ```ts
    export function settleStep(sub: SettleInput, account: { tier: Tier; status: AccountStatus }, day: string): SettlePatch {
      const patch: SettlePatch = {};
      let s = sub;
      if (s.downgrade && day >= s.downgrade.on) {
        const kept = keptPrice(s, account.tier, s.downgrade.on); // unpaid months from before the change keep the old price
        Object.assign(patch, { tier: s.downgrade.tier, downgrade: null }, kept ? { priceTier: kept } : {});
        s = { ...s, downgrade: undefined, priceTier: kept ?? s.priceTier };
      }
      if (s.priceTier && unpaidFrom(s) >= s.priceTier.until) patch.priceTier = null;
      const { state } = subscriptionStatus(s, day);
      const ownPause = state === "lapsed" || state === "ended";
      if (ownPause && account.status === "active") Object.assign(patch, { status: "suspended", pause: state === "lapsed" ? "overdue" : "cancelled" });
      else if (s.pause && !ownPause && account.status === "suspended") Object.assign(patch, { status: "active", pause: null });
      return patch;
    }
    ```
  - `downgradeProblem(to: Tier, usage: { branches: number; staffLogins: number })`: undefined when both fit `TIER_LIMITS[to]`;
    else `` `This clinic has ${b} open branch(es) and ${s} staff login(s). The ${Small} plan includes ${1 branch} and ${5 staff logins}: the Owner must archive branches or deactivate logins before the plan can go down.` ``
    (decision 12; singular/plural as `limitMessage` does).
  - `limitTier(current: Tier, downgrade?: { tier: Tier })`: the smaller of the two (E13).
- `subscription.test.ts` adds: `priceOn` with a change `on: 2026-10-18` → 2026-10-17 gets `before`, 2026-10-18 gets
  current; two same-day changes → the first's `before`; `settleStep` → `{}` for a paid-up active clinic; a downgrade
  whose date came applies, with `priceTier` kept for an unpaid month that began before it; `lapsed` on an active clinic
  → suspended + `overdue`; a manual pause (no `pause`) is left alone; `pause: "overdue"` on a suspended clinic that is
  back in grace → active + `pause: null`; `downgradeProblem("small", { branches: 2, staffLogins: 5 })` names the branch,
  `({ 1, 5 })` is undefined; `limitTier("mid", { tier: "small" })` is `small`.

#### Step 1.3: Receipts, the QR and the widened views

**File:** `packages/shared/src/schemas/payments.ts` (new), `packages/shared/src/schemas/payments.test.ts` (new), `packages/shared/src/schemas/operator.ts`, `packages/shared/src/schemas/signup.ts`, `packages/shared/src/schemas/subscription.ts`, `packages/shared/src/index.ts`
**Verify:** `pnpm run check -- schemas/payments`

Every new request and response shape: QR, receipt upload, receipt views, confirm and reject inputs.

Spec (`schemas/payments.ts`, exported from `index.ts`):

| Name | Shape | Used by |
| --- | --- | --- |
| `PaymentQrView` | `strictObject({ caption: string \| null, updatedAt: IsoDateTime })` | `GET /operator/payment-qr` → `PaymentQrView.nullable()`; inside the two views below |
| `PaymentQrInput` | `{ caption: string.trim().max(120, "Keep the text under 120 characters") }`, `""` → `null` | `PUT /operator/payment-qr`, the `data` part; the image is the `file` part |
| `QR_RULES` / `RECEIPT_RULES` | `{ maxBytes: 2 MB / 5 MB, types: ["image/png", "image/jpeg", "image/webp"] }` | form and server |
| `imageProblem(rules, file?)` | "Attach a screenshot of your receipt" (none) · "Choose a PNG, JPG or WebP image" · "The image must be 5 MB or smaller" (the rule's MB) | form, mock, API (after `sniff`) |
| `ReceiptUploadInput` | `{ reference: string.trim().min(1, "Enter the reference number on your receipt").max(60, "Keep the reference under 60 characters") }` | both receipt uploads, the `data` part; the image is `file` |
| `ReceiptStatus` | `enum(["pending", "confirmed", "rejected"])`, `RECEIPT_STATUS_LABEL = { pending: "Primolar is checking it", confirmed: "Confirmed", rejected: "Not accepted" }` | |
| `ReceiptView` | `strictObject({ id, reference, amountDue: Centavos, uploadedAt, status, rejectionReason: string \| null, periodStart: IsoDate \| null })` | the Owner, the sign-up page |
| `ReceiptToCheck` | `ReceiptView` + `payer: discriminatedUnion("kind", [{ kind: "signup", signupId, signupReference, clinicName }, { kind: "subscription", clinicId, clinicName }])`, strict | `GET /operator/receipts` |
| `ConfirmReceiptInput` | `RecordUpfrontPaymentInput.pick({ method, paidOn })` | `POST /operator/receipts/:id/confirm` |
| `RejectReceiptInput` | `{ reason: trim().min(1, "Tell them why the payment wasn't accepted").max(500, "Keep the reason under 500 characters") }` | `POST /operator/receipts/:id/reject` |

Widened views (all strict already; every producer is updated in this step so the tree compiles):

- `SubscriptionView` += `receipts: ReceiptView[]` (this clinic's, newest first) and `paymentQr: PaymentQrView |
  null`. Mock producer `subscriptionView` returns `[]` / `null` until Step 2.2.
- `SignupStatusView` += `receipt: ReceiptView | null` (the latest) and `paymentQr: PaymentQrView | null`. Mock
  `statusView` returns `null` / `null` until Step 2.2.
- `Signup` += `filesDeletedAt: IsoDateTime.optional()` (decision 15: the record stays, its keys go).
- `AccountOverview.usage` += `storage: Allowance`, `texts: Allowance` (decision 17). Mock `overviewOf` fills them with
  the plan's limits and `inUse: 0` until Step 2.5.

`payments.test.ts` asserts: `SignupStatusView` refuses an extra `fileKey` (strict); `PaymentQrInput` turns `"  "`
into `null`; `imageProblem(RECEIPT_RULES, …)` for no file, `image/gif`, 5 MB + 1; `ReceiptToCheck` refuses a
`subscription` payer carrying `signupId`; `ConfirmReceiptInput` refuses `account_credit`.

#### Phase 1 — Potential Issues

- Widened strict views break every producer at once: that's why each producer gets placeholder values in this phase.
  Tests that `toEqual` a whole `ClinicUsage` or `SubscriptionView` (web `owner-settings.test.ts`,
  `subscriptions.test.ts`, API `owner-settings.int.test.ts`) need the new keys; switch them to `toMatchObject` only
  where the new keys aren't the point.
- `TierLimits` grows two fields: `plan-panel.tsx` and the plan-limit e2e read `TIER_LIMITS` directly; nothing else
  spreads it.
- `manilaMonth` takes a date string on purpose: a `Date` formatted in the browser would use the viewer's zone.

**Issues identified:** placeholder usage values ship for one phase (replaced in 2.5 / 8.3); recorded in Issues Found.

### Phase 2: Seed and the mock (the spec)

#### Step 2.1: Seeded platform: price changes, no QR, receipts, a stored-files ledger in the mock

**File:** `packages/seed/src/platform.ts`, `packages/seed/src/seed-signups.ts`, `packages/seed/src/seed-subscriptions.ts`, `packages/seed/src/seed-receipts.ts` (new), `packages/seed/src/seed.test.ts`, `apps/web/src/mocks/db.ts`
**Verify:** `pnpm run check -- seed.test`

`Platform` gains `priceChanges`, `paymentQr`, `receipts`; each `Db` gains `storedFiles`; key v31.

Spec:

- Stored shape (add to `schemas/payments.ts` with Step 1.3's names): `PaymentReceipt` = `ReceiptView`'s fields +
  `{ payer: { kind: "signup"; signupId } | { kind: "subscription"; clinicId }, fileRef: string | null, decidedAt?:
  IsoDateTime }` (`fileRef` null once purged, decision 15). `PaymentQr = { fileRef, caption: string | null, updatedAt }`.
- `Platform` += `priceChanges: PriceChange[]` (seeded `[]`), `paymentQr: PaymentQr | null` (seeded **null**, so the
  demo opens on decision 23's "Primolar will send you payment details" until the operator uploads one), `receipts:
  PaymentReceipt[]`. `Db` += `storedFiles: { key: string; area: "branding" | "patients" | "photos"; bytes: number }[]`.
- `seed-receipts.ts` (new): one **pending** subscription receipt for Ipin (3 days overdue), `periodStart` = its first
  unpaid month (`unpaidFrom`), `amountDue` = `SEED_PRICES.plans.small.monthlyFee`, `reference: "GC 5012 3344 
  7781"`, `uploadedAt` = yesterday 21:14 Manila, `fileRef: "seed/receipt-ipin"`. The bytes are a small PNG kept in
  `@pedia/seed` beside the seeded photos' bytes (same mechanism: the mock serves `seed/` keys from the package so
  "Reset demo data" never loses them; the API seed writes them to a platform key). Implementer: confirm how
  `features/photos/mocks.ts:81` resolves seeded bytes and reuse it.
- `storedFiles` per tenant: one row per seeded photo, patient photo and stored logo, with the byte counts the API seed
  writes to `StoredFile` (`seed-database.ts`; B10). Demo logos under `demo/` are public files, not stored: no row.
- `mocks/db.ts`: `// v31: B12: Platform gains priceChanges, paymentQr and receipts (Ipin's pending receipt); each Db gains storedFiles.` and the key `pedia-dental:mock-db:v31`.
- `seed.test.ts` asserts: `priceChanges` is empty and `paymentQr` null; exactly one receipt, pending, for `IPIN_ID`,
  whose `periodStart` equals `subscriptionDueOn(anchor, paidMonths)` of Ipin's subscription and whose `amountDue` is
  the Small monthly fee; each tenant's `storedFiles` sum equals its seeded photo bytes.

#### Step 2.2: QR and receipts in the mock

**File:** `apps/web/src/mocks/receipts.ts` (new), `apps/web/src/features/operator/payment-mocks.ts` (new), `apps/web/src/features/operator/signup-mocks.ts`, `apps/web/src/features/signup/mocks.ts`, `apps/web/src/features/clinic/mocks.ts`, `apps/web/src/mocks/subscriptions.ts`, `apps/web/src/mocks/signups.ts`, `apps/web/src/mocks/handlers.ts`, `apps/web/src/mocks/access.ts`, `apps/web/src/mocks/operator.test.ts`, `apps/api/src/auth/access-rules.ts`, `apps/web/src/mocks/payments.test.ts` (new)
**Verify:** `pnpm run check -- mocks/payments.test`

The QR routes, both receipt uploads, Payments to check, confirm and reject.

**The contract** (the API copies it in Phases 5–7; plain-text refusals unless noted):

| Route | Rule | Request | Success | Refusals |
| --- | --- | --- | --- | --- |
| `GET /operator/payment-qr` | operator | | 200 `PaymentQrView \| null` | |
| `PUT /operator/payment-qr` | operator | multipart: `data` = `PaymentQrInput`, `file` = image (optional once a QR exists) | 200 `PaymentQrView` | 400 Zod issues; 400 "Add the QR image" (no file, no QR yet); 400 / 413 `imageProblem(QR_RULES)` |
| `GET /signups/payment-qr/image` | public | | 200 image (`nosniff`, CSP as `fileResponse`); API: 302 to a 5-minute link | 404 "Primolar hasn't added payment details yet" |
| `POST /signups/:reference/receipts` | public | multipart: `data` = `ReceiptUploadInput`, `file` | **201** `SignupStatusView` | 404 the status page's not-found words (unknown or console reference); 409 "This sign-up has already been decided"; 409 "Primolar has already confirmed your payment"; 409 `RECEIPT_PENDING`; 400 / 413 image; 400 issues; 429 (API: E11) |
| `POST /clinic/subscription/receipts` | `clinic.manage` | multipart as above | **201** `SubscriptionView` | 409 "This subscription is cancelled, so Primolar takes no more payments for it."; 409 `RECEIPT_PENDING`; 400 / 413 image; 400 issues |
| `GET /clinic/subscription/receipts/:id/image` | `clinic.manage` | | 200 image (API: 302 link) | 404 "Receipt not found" (another clinic's, a purged or a sign-up's) |
| `GET /operator/receipts` | operator | | 200 `ReceiptToCheck[]`, **pending only, oldest first** (decision 8: the console counts them) | |
| `GET /operator/receipts/:id/image` | operator | | 200 image (API: 302 link) | 404 "Receipt not found" |
| `POST /operator/receipts/:id/confirm` | operator | `ConfirmReceiptInput` | **200** `ReceiptToCheck` (confirmed) | 404; 409 "This receipt has already been checked"; subscription: 409 "This month is already paid. Reject the receipt if it was sent twice." (`periodStart` ≠ first unpaid month), 409 "The amount due has changed since this receipt was sent. Reject it and ask for a new one." (≠ today's amount for that month), 409 the cancelled words; sign-up: 409 "This sign-up has already been decided", 409 "The setup fee is already recorded" |
| `POST /operator/receipts/:id/reject` | operator | `RejectReceiptInput` | **200** `ReceiptToCheck` (rejected) | 404; 409 already checked |

`RECEIPT_PENDING` (shared, `schemas/payments.ts`): "Primolar is still checking your last receipt. If it isn't
accepted, you can send a new one."

Effects: a confirmed subscription receipt runs `recordSubscriptionPayment(clinicId, { method, reference: receipt.reference,
paidOn })` (lifts an `overdue` pause as today); a confirmed sign-up receipt sets `signup.payment = { method, reference,
paidOn, amount: quote.total, recordedAt }`, after which Approve works as today. Rejecting a sign-up
(`/operator/signups/:id/reject`) also rejects its pending receipt with the reason "The sign-up was rejected". The
existing by-hand routes (`/operator/signups/:id/payment`, `/operator/accounts/:id/subscription/payments`) stay for
clinics that pay another way; a pending receipt for a month paid by hand then fails confirm with "already paid".

Spec:

- `mocks/receipts.ts` (platform-only; added to `operator.test.ts`'s source guard): `addReceipt(payer, input, file,
  amountDue, periodStart)`, `pendingFor(payer)`, `latestFor(payer)`, `receiptsOfClinic(clinicId)`, `receiptView`,
  `toCheck` (joins the payer's name), `confirmReceipt(id, input)`, `rejectReceipt(id, reason)`, each returning a
  refusal string or the record, like `recordSubscriptionPayment`. `amountDue` for a subscription is
  `subscriptionView(clinicId).nextAmount` and `periodStart` its first unpaid month; for a sign-up `quote.total`.
- `features/operator/payment-mocks.ts` (new, operator second handler file): the five `/operator/payment-qr` and
  `/operator/receipts` routes. `features/signup/mocks.ts`: the QR image and the sign-up receipt (registered before
  `GET /signups/:reference`). `features/clinic/mocks.ts`: the two `/clinic/subscription/receipts` routes. Spread the new
  handler list in `mocks/handlers.ts`.
- `subscriptionView` and `statusView` fill `receipts` / `receipt` and `paymentQr` for real.
- Rules in `mocks/access.ts` (`RULES`: the two clinic routes at `clinic.manage`; `OPERATOR_RULES`: five; `PUBLIC_RULES`:
  two) and the same in `apps/api/src/auth/access-rules.ts` now, so the drift test stays green (B11 did the same).
- `payments.test.ts` (new) covers each table row: the QR round trip (PUT without file and without QR → 400; with a
  PNG → `GET` view and the image; a caption-only PUT keeps the image); the Owner's upload (201, `receipts[0].status`
  pending; a second → 409 pending; another role → 403; a GIF → 400; 6 MB → 413); Ipin's seeded receipt confirmed →
  `paidMonths + 1`, the pause lifted if it was `overdue`, `GET /operator/receipts` no longer lists it; confirm twice →
  409; a receipt whose month was then paid by hand → 409 "already paid"; reject → the Owner sees `rejectionReason`
  and may upload again (decision 21); the sign-up path (upload by reference → confirm → `paid: true` on the status
  page → approve 201); a console reference → 404; one clinic's receipt image as another clinic's Owner → 404.

#### Step 2.3: Prices from the next due date, downgrades refused, the shared settle step

**File:** `apps/web/src/mocks/subscriptions.ts`, `apps/web/src/features/operator/signup-mocks.ts`, `apps/web/src/features/clinic/mocks.ts`, `apps/web/src/mocks/subscriptions.test.ts`
**Verify:** `pnpm run check -- mocks/subscriptions.test`

The mock bills with `priceOn` and refuses an over-limit downgrade.

Spec:

- `mocks/subscriptions.ts`: `settleSubscriptions` loops and **applies** `settleStep` (the patch's fields onto the account
  and subscription; `null` deletes); `billedTier`, `nextBoundary`, `keepPriceFor` become the shared ones;
  `monthlyFee(tier, periodStart)` = `monthlyFeeOn(platform.priceChanges, platform.prices, tier, periodStart)`, used by
  `recordSubscriptionPayment` and `subscriptionView.nextAmount` (the month's own start, decision 11).
- `changePlan`: before scheduling a downgrade (not an upgrade, not the current plan), `downgradeProblem(tier,
  accountUsage(platform.tenants[clinicId]))` → returned as the 409 (decision 12). The route already maps a refusal to 409.
- `PUT /operator/prices` (`signup-mocks.ts`): if the list changed, push `{ on: today(), before: old }` onto
  `platform.priceChanges`, then replace `platform.prices`. Waiting sign-ups keep their quote (unchanged).
- `features/clinic/mocks.ts` `atLimit`: the tier checked is `limitTier(tier, subscriptionOf(clinicId)?.downgrade)` (E13).
- `subscriptions.test.ts` (the only file that moves the clock) adds: a price rise saved today leaves an overdue clinic's
  `nextAmount` at the old fee, and after that month is paid the next month's is the new fee; a clinic due in 2 days
  gets the new fee at once (its unpaid month starts on the due date); a downgrade of Bulilit (2+ branches, Mid) to
  Small → 409 with `downgradeProblem`'s words; after archiving down to the limit the downgrade is accepted, and adding a
  branch while it waits → 409 Small's `limitMessage`; the settle behaviour tests already there pass unchanged (parity).

#### Step 2.4: Sign-up rate limit and the rejected files' purge

**File:** `packages/shared/src/domain/signup.ts`, `apps/web/src/mocks/signups.ts`, `apps/web/src/features/signup/mocks.ts`, `apps/web/src/mocks/access.ts`, `apps/web/src/mocks/signups.test.ts`
**Verify:** `pnpm run check -- mocks/signups.test`

Five sign-ups an hour; files of sign-ups rejected 30+ days ago are dropped once a day.

Spec:

- `domain/signup.ts`: `SIGNUPS_PER_HOUR = 5`, `SIGNUP_LIMIT_MESSAGE = "Too many sign-ups from this connection. Try
  again in an hour."`, `REJECTED_FILES_DAYS = 30`, `filesDueForDeletion(signup, today)` (rejected, `rejection.at` at
  least 30 Manila days before `today`, `filesDeletedAt` unset).
- `mocks/signups.ts`: a module-level list of submission times (the demo browser is one connection; it resets on
  reload, which is fine for a demo) with `signupHitAllowed(now)` (rolling hour) and `resetSignupHits()` for tests.
  `POST /signups` checks it **first**, before reading the form, and answers 429 with the message. Every attempt
  counts, refused ones included, as the API's `hitRolling` does (E11).
- `purgeRejectedFiles(today)`: for each `filesDueForDeletion`, delete the logo, reference and receipt blobs, clear
  `logoRef`, `referenceRefs` and each receipt's `fileRef`, set `filesDeletedAt`; the record and its words stay
  (decision 15). Called from the gate next to `settleSubscriptions()` (`mocks/access.ts:364`), at most once per mock day.
- `signups.test.ts`: `beforeEach(resetSignupHits)`; a sixth `POST /signups` within the hour → 429 and nothing stored;
  a sign-up rejected 31 days ago (rejection date set on the record) loses its files and keeps its record after one
  request, one rejected 29 days ago keeps them; `GET /operator/signups/:id/files/:key` for a purged key → 404.

#### Step 2.5: Storage and text allowances in the mock

**File:** `apps/web/src/mocks/allowances.ts` (new), `apps/web/src/features/clinic/mocks.ts`, `apps/web/src/features/photos/mocks.ts`, `apps/web/src/features/patients/mocks.ts`, `apps/web/src/mocks/outbox.ts`, `apps/web/src/features/operator/mocks.ts`, `apps/web/src/mocks/allowances.test.ts` (new), `apps/web/src/mocks/operator.test.ts`
**Verify:** `pnpm run check -- mocks/allowances.test`

Uploads refused when full; reminders over the month's parts logged as not sent; usage to the Owner and the console.

Spec:

- `mocks/allowances.ts` (new; pure over a `Db` passed in, so the operator handlers may use it under the guard):
  `storedBytes(tenant)`, `recordStored(tenant, key, area, bytes)`, `forgetStored(tenant, key)`,
  `storageRefused(tenant, tier, adding)` (→ `storageRefusal`), `textPartsUsed(tenant, month)` = Σ `smsSegments(body)`
  of messages **queued or sent** whose `sendAt` falls in `month` (the mock never sends, so it counts what it queued;
  the API counts what it dispatched, E9), and `usageOf(tenant, account, month)` → `ClinicUsage`.
- Uploads (`clinic/mocks.ts` logo, `patients/mocks.ts` photo, `photos/mocks.ts` clinical photos, the operator's
  branding logo and `createClinic`'s logo copy): check `storageRefused` **before** storing (409 with the words), then
  `recordStored`; a replaced logo or photo calls `forgetStored` for the old key.
- `mocks/outbox.ts` `queueMessage`: for a template kind, `textPartsRefusal(kind, textPartsUsed(db, month of sendAt),
  smsSegments(body), limit)` → the message is logged `failed` with `FAILURE.textLimit` and gets no outbox entry
  (decision 19: never sent later). Account texts are never refused.
- `GET /clinic/usage` and `overviewOf` return the real `storage`, `texts` and `month` (`manilaMonth(today())`).
- `allowances.test.ts` (new): Ngiti (Small) with a ledger row taking it to 2 GB − 10 bytes → a patient photo upload is
  409 `storageFullMessage("small")` and nothing is stored or recorded; Bulilit (Mid) stores the same photo; replacing the
  logo frees the old bytes; Ngiti with 299 parts used → booking queues a `failed` reminder with "Monthly text limit
  reached", while a portal invite to a guardian still queues; `/clinic/usage` shows both numbers and the month;
  the console's overview of Ngiti shows the same usage. `operator.test.ts`: the source guard lists `payment-mocks.ts`,
  `mocks/receipts.ts`, `mocks/allowances.ts`.

#### Phase 2 — Potential Issues

- **The rate limit can fail older tests:** any test file that submits more than five sign-ups (`signups.test.ts`,
  `operator-signups.test.ts`, the sign-up e2e) must call `resetSignupHits()` / use a fresh context. Playwright gives
  each test a fresh page, and the list is in memory, so e2e is safe.
- **Clock-moving tests stay in `subscriptions.test.ts`** (root CONVENTIONS trap); the purge test sets the rejection date
  on the record instead of moving the clock.
- **The guard** (`operator.test.ts`) fails if `receipts.ts`/`payment-mocks.ts` read `db` or a session: the clinic
  routes live in `features/clinic/mocks.ts`, which passes `currentClinicId()` in.
- Mock text counting differs from the API's by design (queue time vs dispatch time). The refusal words and the kinds
  refused are the same; Follow Ups records the difference.
- `queueMessage` runs inside booking handlers that persist afterwards; the failed row persists with them, so no extra
  write path appears.

**Issues identified:** a pending receipt can outlive a by-hand payment of the same month (confirm then refuses with
"already paid" and the operator rejects it); accepted, recorded in Issues Found.

## B12b: Web

### Phase 3: Screens

#### Step 3.1: Hooks and the receipt form data

**File:** `apps/web/src/features/payments/form-data.ts` (new), `apps/web/src/features/operator/api.ts`, `apps/web/src/features/clinic/api.ts`, `apps/web/src/features/signup/api.ts`
**Verify:** `pnpm run typecheck`

Load the `ui-ux-design` skill before Steps 3.2–3.4 (root CONVENTIONS → UI and UX).

- `payments/form-data.ts`: `imageFormData(data: object, file?: File)` → `FormData` with a `data` JSON part and a `file`
  part; the only builder for the QR and receipt bodies (as `signupFormData` is for sign-ups).
- `clinic/api.ts`: `useUploadReceipt()` → `POST /clinic/subscription/receipts`, parses `SubscriptionView`, sets
  `clinicKeys.subscription`. `receiptImageUrl(id)` for the Owner's `<img>`/link.
- `signup/api.ts`: `useUploadSignupReceipt(reference)` → parses `SignupStatusView`, sets the status query;
  `PAYMENT_QR_IMAGE` = `/signups/payment-qr/image?v=<updatedAt>` (a new URL per upload, so no stale cache).
- `operator/api.ts` (keys start with `"operator"`): `usePaymentQr()`, `useSavePaymentQr()`, `useReceiptsToCheck()`
  (refetch on window focus; the nav badge reads its length), `useConfirmReceipt(id)`, `useRejectReceipt(id)`; both
  decisions invalidate `["operator"]` so the account's subscription and the sign-up refresh.

#### Step 3.2: Pay by QR and the receipt upload, on Settings → Plan and the sign-up status page

**File:** `apps/web/src/features/payments/components/pay-by-qr.tsx` (new), `apps/web/src/features/payments/components/receipt-upload.tsx` (new), `apps/web/src/features/clinic/components/plan-panel.tsx`, `apps/web/src/features/signup/components/signup-status-screen.tsx`
**Verify:** `test -f apps/web/src/features/payments/components/receipt-upload.tsx`

- `PayByQr({ qr, amount, vat })` (new): the QR image (`alt="Primolar's payment QR code"`), the caption under it, the
  amount due with its VAT (`formatPeso`); with `qr === null`, only "Primolar will send you payment details." (23).
- `ReceiptUpload({ latest, onSubmit, pending })` (new): RHF + `ReceiptUploadInput`; a file input (accept from
  `RECEIPT_RULES`, checked with `imageProblem` before sending) and the reference field; server refusals shown inline
  (409 words as written). State by `latest`: none or rejected → the form (rejected also shows "Not accepted:
  {reason}. Send a new receipt." in an alert); pending → "Primolar is checking your receipt (ref …), sent {date}." and
  no form; confirmed → nothing (the payment shows in the history).
- `plan-panel.tsx` `BillingCard`: below the status rows, while not cancelled and the state is `due_soon`, `overdue` or
  `paid` with no pending receipt, `PayByQr` with `nextAmount`/`nextVat` and `ReceiptUpload` with `receipts[0]`; a
  "Receipts you sent" list (date, reference, amount, status label, a link to the image).
- `signup-status-screen.tsx`: while waiting and not paid, `PayByQr` with `quote.total`/`quote.vat` and `ReceiptUpload`
  with `receipt`; once paid, "Payment confirmed. Primolar will set up your clinic." The page stays inside the public
  sign-up frame (Primolar wordmark allowed there, `design-branding.test.ts`).
- A component test is optional; the e2e in Step 3.4 drives both screens.

#### Step 3.3: The console: Payments to check, the QR card, usage

**File:** `apps/web/src/features/operator/components/payments-screen.tsx` (new), `apps/web/src/app/operator/(console)/payments/page.tsx` (new), `apps/web/src/features/operator/components/payment-qr-card.tsx` (new), `apps/web/src/features/operator/components/price-list-screen.tsx`, `apps/web/src/features/operator/components/operator-shell.tsx`, `apps/web/src/features/operator/components/account-detail.tsx`, `apps/web/src/features/operator/components/signup-detail.tsx`
**Verify:** `test -f "apps/web/src/app/operator/(console)/payments/page.tsx"`

- `payments-screen.tsx` + `/operator/payments` page: "Payments to check" (decision 8), oldest first. Each row: who
  (clinic name, or the sign-up's clinic name and reference), what for (the month from `periodStart`, or "Setup fee and
  first month"), amount due, the typed reference, when sent, the receipt image (opens full size in a new tab). Confirm
  opens a small dialog with `method` (GCash default) and `paidOn` (the upload's Manila date by default) and says
  "Confirm only if the receipt shows the full {amount}" (22); Reject asks for the reason the clinic will see. Empty:
  "No payments to check."
- `operator-shell.tsx`: a "Payments to check" nav entry with the count badge (`useReceiptsToCheck().data.length`;
  hidden at 0, text + number, never colour alone).
- `payment-qr-card.tsx` on the Price list screen: the current QR and caption or "No QR yet: clinics see 'Primolar will
  send you payment details'"; Replace QR (file) and the caption field, saved with one button.
- `account-detail.tsx`: Usage gains "Storage {formatStorage(inUse)} of {limit}" and "Texts this month {inUse} of
  {limit}" (17); a downgrade refusal shows the 409 words in place; the subscription card lists the clinic's receipts.
- `signup-detail.tsx`: when a pending receipt exists for this sign-up (filter `useReceiptsToCheck` by `signupId`),
  "A payment receipt is waiting" with a link to Payments to check; Record payment stays for other ways of paying.

#### Step 3.4: Usage on the Plan, the Owner's text warning, MSW e2e

**File:** `apps/web/src/features/clinic/components/plan-panel.tsx`, `apps/web/src/features/clinic/components/usage-banner.tsx` (new), `apps/web/src/components/app-shell.tsx`, `apps/web/e2e/operator.spec.ts`, `apps/web/e2e/signup.spec.ts`, `apps/web/e2e/owner.spec.ts`
**Verify:** `pnpm run check -- design`

- `plan-panel.tsx`: two more `Allowance` tiles, "Storage" (`formatStorage`) and "Texts in {Month}"; the text notice
  under them when `textAllowanceNotice` returns one.
- `usage-banner.tsx` (new), mounted in `app-shell.tsx` beside `BillingBanner`, for `clinic.manage` only (as the
  billing banner decides it): the `textAllowanceNotice` text, `warning` as a notice and `limit` as an alert, with a
  link to Settings → Plan. Icon + words, never colour alone; dark-mode tokens only.
- e2e on MSW: `operator.spec.ts` uploads a QR, confirms Ipin's seeded receipt from Payments to check (the badge drops
  to 0) and sees Ipin back to "Overdue, in grace"/paid; `signup.spec.ts` submits, sees "Primolar will send you payment
  details", then (QR uploaded by an operator step in the same test, or seeded through `localStorage`) uploads a receipt
  and sees "Primolar is checking"; `owner.spec.ts` sees Storage and Texts on the Plan tab.

#### Phase 3 — Potential Issues

- `design-*` guards: the QR is an image, not colour; the receipt status uses tokens; the badge is text. A raw hex or a
  `bg-white` QR frame fails the guard: use the surface tokens and let the image carry its own white.
- The Owner of a **paused** clinic can't sign in (decision 4), so they can't reach the Plan tab to send a receipt. The
  sign-in refusal for a subscription pause already exists; Questions 1 proposes its wording point at Primolar.
- `useReceiptsToCheck` refetch-on-focus is the only "notification" (decision 8: no email).
- The Plan panel is Owner-only (`clinic.manage`) already, so receipts are never shown to other staff (24).

**Issues identified:** None beyond Questions 1.

## B12c: API

### Phase 4: Tables, migration and the API seed

#### Step 4.1: Schema, migration, scopes

**File:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_b12_operator_billing/migration.sql` (new), `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`
**Verify:** `pnpm run check -- tenant-scope`

All new models are **platform** in `MODEL_SCOPE` (Primolar's records; every query names `clinicId` itself where it has
one, as `Credential` does). Ids `cuid(2)`, money `Int` centavos, calendar dates `@db.Date` (Manila), instants `DateTime`.

| Model | Columns | Keys and indexes | Notes |
| --- | --- | --- | --- |
| `PlatformSettings` | `id String @id` (`"primolar"`), `smallSetupFee`, `smallMonthlyFee`, `midSetupFee`, `midMonthlyFee`, `bigSetupFee`, `bigMonthlyFee`, `designAddOn` (Int), `paymentQrKey String? @db.VarChar(191)`, `paymentQrCaption String? @db.VarChar(120)`, `paymentQrUpdatedAt DateTime?` | | The platform lock (E6). Written by the seed and the migration's `INSERT` (below) |
| `PriceChange` | `id`, `on @db.Date`, the seven fee columns (the list **before** `on`), `createdAt` | `@@index([on])` | `APPEND_ONLY` |
| `Signup` | `id`, `reference Char(13) @unique`, `source SignupSource (form, console)`, `submittedAt`; `name`, `nameKey VarChar(191)` (`clinicNameKey`), `contactEmail`, `contactEmailKey` (lowercase), `tin`, `tier Tier`; branch: `branchName`, `branchAddress`, `branchPhone`, opening hours as `Branch` stores them; `ownerName`, `ownerEmail`, `ownerRole StaffRole`; `branding BrandingChoice (own, default, designed)`, `brandColor Char(7)?`, `headingFont HeadingFont?`, `brief Text?`, `logoKey VarChar(191)?`, `referenceKeys Json` (string[], ≤ 3); quote: `quoteSetupFee`, `quoteFirstMonth`, `quoteDesignAddOn`, `quoteTotal`, `quoteVat`; payment: `paymentMethod PaymentMethod?`, `paymentReference VarChar(60)?`, `paidOn Date?`, `paymentAmount Int?`, `paymentRecordedAt?`; `status SignupStatus (waiting, approved, rejected)`, `rejectionReason Text?`, `rejectedAt?`, `clinicId String? @unique`, `approvedAt?`, `designStatus DesignStatus?`, `designDeliveredAt?`; agreement: `termsVersion`, `dpaVersion`, `acceptedBy`, `agreedAt`, `agreementMethod AgreementMethod`, `signedOn Date?`; `filesDeletedAt?` | `@@index([status, submittedAt])`, `@@index([nameKey])`, `@@index([contactEmailKey])`, `@@index([status, rejectedAt])` | Every column of `Signup` in the contract has a home; `signup.rows.ts` maps both ways |
| `Subscription` | `clinicId String @id`, `anchor Date`, `paidMonths Int`, `downgradeTier Tier?`, `downgradeOn Date?`, `priceTier Tier?`, `priceTierUntil Date?`, `cancelledAt?`, `pause SubscriptionPause (overdue, cancelled)?` | | One per clinic |
| `SubscriptionPayment` | `id`, `clinicId`, `invoiceNo VarChar(16) @unique`, `tier`, `periodStart Date`, `periodEnd Date`, `method PaymentMethod`, `reference VarChar(60)?`, `paidOn Date`, `amount Int`, `recordedAt`, `receiptId String? @unique` | **`@@unique([clinicId, periodStart])`** (one payment per month: the race backstop), `@@index([clinicId, recordedAt])` | `APPEND_ONLY` |
| `SubscriptionLine` | `id`, `paymentId`, `position Int`, `label VarChar(191)`, `amount Int` | `@@unique([paymentId, position])` | `APPEND_ONLY` |
| `InvoiceCounter` | `id String @id` (`"primolar"`), `next Int` | | Gapless `PRM-INV-#####`, always the **last** lock (E6) |
| `PaymentReceipt` | `id`, `purpose ReceiptPurpose (signup, subscription)`, `signupId?`, `clinicId?`, `periodStart Date?`, `amountDue Int`, `reference VarChar(60)`, `fileKey VarChar(191)?`, `bytes Int`, `uploadedAt`, `status ReceiptStatus (pending, confirmed, rejected)`, `decidedAt?`, `rejectionReason VarChar(500)?` | `@@index([status, uploadedAt])`, `@@index([clinicId, uploadedAt])`, `@@index([signupId, uploadedAt])` | Not append-only: status is decided in place |

- Migration: write the SQL with `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
  --script` (the B3 trap), then append `INSERT INTO PlatformSettings … VALUES ('primolar', <SEED_PRICES>, NULL, NULL,
  NULL)` and `INSERT INTO InvoiceCounter VALUES ('primolar', 1)` so a production database has both singletons; the
  seed updates them. `db:deploy`, `db:generate`.
- `MODEL_SCOPE`: the eight models as `"platform"` under a `// B12: Primolar's billing` comment; `APPEND_ONLY` gains
  `PriceChange`, `SubscriptionPayment`, `SubscriptionLine`. `tenant-scope.test.ts` already fails for a missing model;
  add one case: a `Subscription` query with no clinic in context is **not** refused (platform), a `Branch` query still is.

#### Step 4.2: The API seed writes the platform's billing

**File:** `apps/api/src/seed/seed-database.ts`, `apps/api/src/storage/storage.ts`, `apps/api/src/signups/signup.rows.ts` (new), `apps/api/test/int/seed.int.test.ts`
**Verify:** `pnpm run typecheck`

- From `seedPlatform()`: `PlatformSettings` upserted with `platform.prices` and no QR; `priceChanges` (none);
  `signups` through `signup.rows.ts`'s `toSignupRow` (Step 6.1 file, created here as the mapping only); `subscriptions`
  with their payments and lines; `InvoiceCounter.next` = number of seeded payments + 1; `receipts` with Ipin's seeded
  PNG written through `fileStorageOf` to a `platform/receipts/` key (Step 5.1's `platformKey`; until then a literal key
  of that shape) and `fileKey` set.
- `seed.int.test.ts`: counts match the platform (1 sign-up, 3 subscriptions, 14 payments, 1 pending receipt whose file
  exists through the driver), `InvoiceCounter.next = 15`.

#### Phase 4 — Potential Issues

- **A database seeded before B12 has no billing rows** and `db:seed` refuses one with accounts: use a fresh one (as
  every chunk since B3). The migration's two `INSERT`s keep a live database usable without the seed.
- Step 4.2 depends on `platformKey` from Step 5.1: either move `platformKey` (two functions, no service) into this step
  or write the literal key; the plan prefers moving the two functions here (`storage.ts`), leaving the service for 5.1.
- `Signup.referenceKeys` is JSON (an array of keys, not money or personal data) — the one JSON column added; parsed
  with `z.array(z.string()).max(3)` on read.
- Opening hours: copy `Branch`'s columns exactly so `createClinic` maps one to the other without reshaping.

**Issues identified:** None.

### Phase 5: Platform files, multi-part uploads, prices and the QR

#### Step 5.1: `PlatformFilesService` and platform keys

**File:** `apps/api/src/storage/storage.ts`, `apps/api/src/storage/platform-files.service.ts` (new), `apps/api/src/storage/local-disk.storage.ts`, `apps/api/src/storage/storage.module.ts`, `apps/api/src/storage/platform-files.test.ts` (new)
**Verify:** `pnpm run check -- platform-files`

- `storage.ts`: `PLATFORM_AREAS = ["signups", "receipts", "payment-qr"]`, `platformKey(area, name, ext)` →
  `platform/<area>/<name>.<ext>`, `parsePlatformKey(key)` (same segment and extension rules as `parseKey`; a clinic key
  is never a platform key and the reverse). `parseKey` is unchanged.
- `PlatformFilesService` (new, in `StorageModule`, exported): `putFile(area, ext, file: CheckedFile)`, `copy(key) →
  Buffer` for the approval's logo copy (`get`), `link(key, { fileName })`, `delete(key)`; refuses anything
  `parsePlatformKey` rejects. **No ledger row and no request clinic** (E2). Callers decide who may read.
- `LocalDiskStorage.link` and the local `/files/:token` read accept a platform key as well as a clinic key (both
  parsed; the token is signed either way). `delete-file.handler.ts` (outbox `storage.delete`) accepts platform keys
  through `PlatformFilesService` when the payload says `platform: true`.
- `platform-files.test.ts`: keys round-trip; `platform/../x.png`, `platform/other/x.png`, a clinic key → refused;
  `put` writes no `StoredFile` row (Prisma mock asserts no `storedFile.create`); a local link for a platform key opens.

#### Step 5.2: `readUploads`: several named file parts

**File:** `apps/api/src/storage/multipart.ts`, `apps/api/src/storage/multipart.test.ts`
**Verify:** `pnpm run check -- multipart`

- `readUploads(req, { parts: Record<string, { max: number; maxBytes: number }> })` → `{ fields, files: Record<string,
  SpooledFile[]>, dispose() }`; each part to its own temp file, `tooLarge` per file; a part beyond `max` or with an
  unknown name is drained and dropped; `tooLargeToRead` uses Σ `max × maxBytes`. `readUpload(req, { maxBytes })` becomes
  `readUploads(req, { parts: { file: { max: 1, maxBytes } } })` mapped back to `{ fields, file }` (B10 callers unchanged).
- Tests: two `reference` parts and one `logo` spool to three files; a fourth `reference` is dropped; an unknown part is
  dropped; one oversized part sets `tooLarge` on it only; `dispose()` removes every temp file; the old `readUpload`
  cases still pass.

#### Step 5.3: `PlatformSettingsModule`: prices and the QR

**File:** `apps/api/src/platform-settings/platform-settings.service.ts` (new), `apps/api/src/platform-settings/prices.controller.ts` (new), `apps/api/src/platform-settings/payment-qr.controller.ts` (new), `apps/api/src/platform-settings/platform-settings.module.ts` (new), `apps/api/src/app.module.ts`, `apps/api/src/auth/access-rules.ts`
**Verify:** `pnpm run check -- access-rules`

- `PlatformSettingsService` (the only reader and writer of `PlatformSettings` and `PriceChange`):
  - `lockPlatform(tx)`: `SELECT id FROM PlatformSettings WHERE id = 'primolar' FOR UPDATE` (E6's first lock; the first
    statement of every transaction that uses it).
  - `prices(db = prisma)` → `PriceList`; `priceChanges(db)` → `PriceChange[]` in `createdAt` order;
    `monthlyFee(tier, periodStart, db)` → `monthlyFeeOn(…)` (the shared rule).
  - `savePrices(list)`: transaction: lock → read → if changed, insert `PriceChange { on: clock.today(), before: old }`
    and update → `PriceList`. Audit as the operator (`AuditService.record`, action `update`, record "Price list").
  - `qr()` → `PaymentQrView | null`; `saveQr(caption, file?)`: sniff + `imageProblem(QR_RULES)` **before** storing; put
    the new file (`payment-qr` area); transaction: lock → swap key, caption, `updatedAt` → commit; then queue the old
    key's deletion through the outbox (`storage.delete`, platform) inside that transaction; no file and no QR → 400
    "Add the QR image". `qrLink()` → a 5-minute link or undefined.
- `PricesController`: `GET /signups/prices` (public), `GET /operator/prices`, `PUT /operator/prices`
  (`ZodValidationPipe(PriceList)`, 200).
- `PaymentQrController`: `GET /operator/payment-qr` (200 view or `null`), `PUT /operator/payment-qr` (`readUploads`
  with `file` ≤ `QR_RULES.maxBytes`, `data` → `PaymentQrInput`; 413 when `tooLarge`; `@HttpCode(200)`),
  `GET /signups/payment-qr/image` (302 to the link; 404 "Primolar hasn't added payment details yet").
- `access-rules.ts`: the routes were added in Step 2.2; this step only checks the drift test passes with real controllers.

#### Step 5.4: Routes reach a controller; prices and QR on MySQL

**File:** `apps/api/test/operator-routes.test.ts` (new), `apps/api/test/int/platform-settings.int.test.ts` (new)
**Verify:** `pnpm run check -- operator-routes`

- `operator-routes.test.ts` (as `clinic-routes.test.ts`): every `/operator/*` route this phase adds answers 401
  without `pd_operator` and reaches its controller with a faked operator session; a clinic session on an operator
  route → 401; the public routes answer without any cookie. Later steps add their routes to the same table.
- `platform-settings.int.test.ts`: `PUT /operator/prices` twice on one day writes two `PriceChange` rows and
  `monthlyFee(small, yesterday)` returns the list before the first; a QR upload then a caption-only `PUT` keeps the key;
  a replacement queues the old key's deletion and the worker removes it; a GIF → 400, 3 MB → 413; `GET
  /signups/payment-qr/image` → 302 then 200 image; parallel `PUT /operator/prices` (5) → five rows, no deadlock.

#### Phase 5 — Potential Issues

- **S3 IAM**: the role allows `clinics/*` only (API CONVENTIONS trap). `platform/*` must be added before go-live, or
  every QR, sign-up file and receipt fails in production while local disk works. Listed in Follow Ups for B13.
- The QR image route is public by design (a payment QR is meant to be shared); the receipt routes never are.
- `readUploads` widens a B10 primitive: B10's tests must stay green unchanged (they exercise the wrapper).
- New pattern flagged: platform files without a ledger. Why: the ledger is a clinic's storage count (decision 16
  excludes receipts) and `StoredFile.clinicId` is required; sign-ups have no clinic.

**Issues identified:** S3 policy change (go-live, B13).

### Phase 6: Sign-ups, `createClinic`, usage reads

#### Step 6.1: The leaf services: subscription records, receipt records, usage

**File:** `apps/api/src/subscription-records/subscription-records.service.ts` (new), `apps/api/src/subscription-records/subscription.rows.ts` (new), `apps/api/src/subscription-records/subscription.rows.test.ts` (new), `apps/api/src/subscription-records/subscription-records.module.ts` (new), `apps/api/src/receipt-records/receipt-records.service.ts` (new), `apps/api/src/receipt-records/receipt.rows.ts` (new), `apps/api/src/receipt-records/receipt-records.module.ts` (new), `apps/api/src/usage/usage.service.ts` (new), `apps/api/src/usage/usage.module.ts` (new)
**Verify:** `pnpm run check -- subscription.rows`

- `subscription.rows.ts`: `toSubscription(row, payments)` → the shared `Subscription` (so every shared rule runs on
  it unchanged), `toSubscriptionPayment(row, lines)`, `subscriptionPatch(SettlePatch)` → Prisma `data` (`null` →
  column null; `downgrade: null` clears both columns). `subscription.rows.test.ts`: a row with a downgrade and a
  `priceTier` round-trips; `@db.Date` columns come back as `yyyy-MM-dd` in Manila; a patch of `{}` is `{}`.
- `SubscriptionRecordsService` (imports `PlatformSettingsModule`, `ReceiptRecordsModule`; **the only reader and
  writer of `Subscription`, `SubscriptionPayment`, `SubscriptionLine`, `InvoiceCounter`**). This step:
  `lock(tx, clinicId)` (`SELECT … FROM Subscription WHERE clinicId = ? FOR UPDATE`), `read(tx, clinicId)` →
  `Subscription`, `nextInvoiceNo(tx)` (`InvoiceCounter` `FOR UPDATE`, `next + 1`; always the last lock),
  `start(tx, { clinicId, tier, quote, payment, anchor })` (the mock's `startSubscription`: the upfront payment is
  invoice 1 of this clinic, lines Setup fee / First month / Design it for me), `view(clinicId)` → `SubscriptionView`
  (state from `subscriptionStatus(sub, clock.today())`, `nextAmount` from `monthlyFee(billedTier(…), unpaidFrom)`,
  `receipts` and `paymentQr` from the two leaves, `today` = `clock.today()`).
- `ReceiptRecordsService` (imports `StorageModule`; the only reader and writer of `PaymentReceipt`): `add(tx, row)`,
  `lock(tx, id)`, `pendingFor(tx, payer)` (a locking read), `latestFor(payer)`, `ofClinic(clinicId)`,
  `pending()` (oldest first, joined to the payer's name in one query per kind: no N+1), `decide(tx, id, { status,
  reason? })`, `fileLink(id, scope: { clinicId } | "operator")` (404 unless the scope owns it; decision 24),
  `forgetFiles(tx, signupId)` → keys to delete. `receipt.rows.ts`: `toReceiptView`, `toReceiptToCheck`.
- `UsageService` (new leaf over raw grouped SQL, because the operator reads every clinic at once and the tenant
  extension refuses cross-clinic model queries; each query names `clinicId` explicitly — the raw-SQL trap):
  `forClinics(ids, month)` → `Map<clinicId, { branches, staffLogins, patients, storageBytes, textParts }>` with one
  `GROUP BY clinicId` query per measure (`Branch` open, `Staff` active, `Patient`, `SUM(StoredFile.bytes)`,
  `SUM(Message.segments)` with `dispatchedAt` in the month's Manila bounds). `forClinic(clinicId, month)` = the same
  for one. `monthBounds(month)` uses local `Date` (the process is Manila, as `sentIn`), wrapped through `utc()` for raw
  SQL (the B8 trap). `Number(...)` around every aggregate (bigint/DECIMAL traps).

#### Step 6.2: `SignupsService`, the controllers, the rate limit, the account overview

**File:** `apps/api/src/signups/signups.service.ts` (new), `apps/api/src/signups/signup-form.ts` (new), `apps/api/src/signups/signup.rows.ts`, `apps/api/src/signups/signups.controller.ts` (new), `apps/api/src/signups/signups.module.ts` (new), `apps/api/src/operator/operator-signups.controller.ts` (new), `apps/api/src/operator/account-overview.ts` (new), `apps/api/src/operator/operator.module.ts` (new), `apps/api/src/auth/rate-limit.ts`, `apps/api/src/auth/rate-limit.test.ts`, `apps/api/src/app.module.ts`, `apps/api/test/operator-routes.test.ts`
**Verify:** `pnpm run check -- rate-limit`

- `rate-limit.ts`: `RATE_LIMITS.signup = { hits: SIGNUPS_PER_HOUR, windowSeconds: 3600 }`, `receipt = { hits: 10,
  windowSeconds: 3600 }`; `groupOf` unchanged (these are counted by the service, not the `/auth` middleware). Test:
  both entries' numbers; `bucketOf("signup", ip)`.
- `signup-form.ts`: `readSignupForm(req, schema)` → `{ data, logo?: CheckedImage, references: CheckedImage[],
  dispose }` with `readUploads(parts: { logo: { max: 1, maxBytes: LOGO_RULES.maxBytes }, reference: { max: 3,
  maxBytes: REFERENCE_IMAGE_RULES.maxBytes } })`; `data` JSON → schema (`ZodIssuesException`); the logo through
  `cleanLogo` (B3's sniff + SVG sanitiser), references sniffed PNG/JPEG; the mock's words and statuses (413 for an
  oversized logo, 400 otherwise). `brandingRefusal` ported word for word.
- `SignupsService` (owns `Signup`; imports `PlatformSettingsModule`, `ReceiptRecordsModule`, `StorageModule`,
  `AuthModule` for `RateLimitService` and `IdentityService`):
  - `submit(req)`: `hitRolling(bucketOf("signup", req.ip))` **first** → 429 `SIGNUP_LIMIT_MESSAGE`; read the form;
    store the files (`signups` area) before the transaction; transaction: `lockPlatform` → `duplicateOf` (below) →
    insert with `quote = amountDue(prices, tier, choice)` and `reference` (retry on P2002 of the unique) → commit;
    a failure deletes the stored files; dispose the temp files in `finally`. 201 `SignupStatusView`.
  - `duplicateOf(tx, account, exceptId?)`: under the platform lock, reads `name, contactEmail` of every account and of
    waiting sign-ups (`select`, two queries) and applies `sameClinicName` and the lowercase email rule, returning the
    shared words. Fine at Primolar's size; Follow Ups notes the indexed `nameKey` route for later.
  - `status(reference)`: trimmed and upper-cased; `source = form` only; 404 the mock's words; `SignupStatusView`
    with `receipt` and `paymentQr`.
  - Operator: `list()` newest first → `Signup[]`; `fileLink(id, key)` (302; 404 "That file isn't part of this
    sign-up" for a key the row doesn't hold or a purged one); `fix(id, req)`: files first, then `lockPlatform` →
    `lockSignup` (`FOR UPDATE`) → still waiting (409) → `brandingRefusal` → `duplicateOf(…, id)` → `PAID_PLAN_LOCKED`
    on a re-quote of a paid one → update; the replaced keys' deletion queued through the outbox in the same
    transaction. `recordPayment(id, input)`: `lockSignup` → waiting, not paid → `payment = { …input, amount:
    quoteTotal, recordedAt }`. `reject(id, reason)`: `lockSignup` → waiting → rejected + `rejectedAt`; its pending
    receipt (`pendingFor`, locked after the sign-up per E6) → rejected "The sign-up was rejected". `approve(id)`: Step 6.3.
  - Each operator write is audited as the operator (`AuditService.record`, the sign-up's id, never a name).
- `SignupsController` (public): `POST /signups` (201), `GET /signups/:reference`. The receipt route comes in Step 7.3.
- `account-overview.ts`: `AccountOverviewService.of(clinicIds)` → `AccountOverview[]` from one read of the accounts,
  their Owners (`Staff.isOwner`, raw grouped as `UsageService`), the latest agreements, the design status from
  `Signup.clinicId`, consent counts and `UsageService.forClinics` (with each tier's limits). Built to parse with the
  strict schema.
- `OperatorModule` (new; imports `SignupsModule`, the leaves, `UsageModule`) with `OperatorSignupsController`:
  `GET /operator/signups`, `GET /operator/signups/:id/files/:key` (302), `PUT /operator/signups/:id` (200),
  `POST /operator/signups/:id/payment` (`@HttpCode(200)`), `…/reject` (`@HttpCode(200)`), `…/approve` (**201**
  `CreateAccountResult`). Add every route to `operator-routes.test.ts`.

#### Step 6.3: `ClinicFactory`: the clinic in one transaction

**File:** `apps/api/src/signups/clinic-factory.ts` (new), `apps/api/src/signups/clinic-factory.test.ts` (new), `apps/api/src/signups/signups.service.ts`, `apps/api/src/signups/signups.module.ts`
**Verify:** `pnpm run check -- clinic-factory`

`SignupsService.approve(id)` and (Step 7.2) the direct creation share it (the mock's rule: new clinics are made only by
`createClinic`). The shape, since the order is the hard part:

```ts
async approve(id: string): Promise<CreateAccountResult> {
  const ids = newClinicIds(); // clinicId, branchId, staffId, chairId: cuid2, made before anything is locked
  const secrets = await this.identity.newStaffSecrets(); // argon2 before the transaction (B3 trap)
  const made = await requestContext.within({ clinicId: ids.clinicId }, () =>
    runInTransaction(this.prisma, async (tx) => {
      await this.settings.lockPlatform(tx); // E6: platform → signup → the new rows
      const signup = await this.lockSignup(tx, id); // 404 / 409 decided
      if (!signup.payment) throw new ConflictException("Record the setup fee before approving");
      const clash = await this.duplicateOf(tx, signup.account, signup.id);
      if (clash) throw new ConflictException(clash);
      return this.factory.write(tx, signup, ids, secrets); // every row below, then the sign-up's approval
    }),
  );
  await this.copyLogo(made).catch((e) => this.log.warn(`Logo copy for ${ids.clinicId} failed (${errorName(e)})`)); // E7: after commit
  return { overview: (await this.overviews.of([ids.clinicId]))[0]!, temporaryPassword: secrets.temporaryPassword, pin: secrets.pin };
}
```

- `ClinicFactory.write(tx, signup, ids, secrets)` writes, in order: `ClinicAccount` (status active, Primolar's colour;
  `own` → the colour and font), `Agreement` (the sign-up's), `Branch` (position 0), `Staff` (Owner, position 0),
  `IdentityService.createStaffLogin` (the Owner's login with `mustChange`), one `Chair`, `PROCEDURES`,
  `NOTE_TEMPLATES`, `defaultMessageTemplates`, `firstNotice(...)` as the `PrivacyNotice`, the audit event "Terms and
  DPA (accepted)" dated the agreement, `SubscriptionRecordsService.start` (anchor `clock.today()`), and the sign-up's
  `approved` / `clinicId` / `approvedAt` / `designStatus: in_progress` (designed). Tenant rows use `clinicData()` (the
  context holds the new id). Reuse `seed-database.ts`'s row mappers where they exist; don't re-type a template.
- `copyLogo`: the sign-up's logo bytes (`PlatformFilesService.copy`), `StorageService.put("branding", ext, buf)` in
  the new clinic's context (counts toward its storage, E8), then `lockAccount` → `logoRef`.
- `clinic-factory.test.ts` (unit, Prisma faked): `write` creates the rows in the listed order (a recording fake) and
  never touches `Signup` before `ClinicAccount`; `designed` sets `designStatus`; `default` stores no colour override.

#### Step 6.4: Sign-ups on MySQL: duplicates under races, approve, the limit

**File:** `apps/api/test/int/signups.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/signups.int.test.ts`

Port of `mocks/signups.test.ts` and `mocks/operator-signups.test.ts` (the shared words), plus:
- 5 parallel `POST /signups` with one clinic name → exactly one 201, four 409 with `duplicateNameMessage`;
  a sixth sign-up from one address within the hour → 429 and no row; `RateLimitCounter` cleared in `beforeEach`.
- Approve → the Owner signs in with the temporary password (then the confidentiality acknowledgement, root
  CONVENTIONS trap), sees one branch, one chair, the procedures and templates; `Subscription.paidMonths = 1`, the first
  payment has the next `PRM-INV` number and the quote's lines; a `Use my own` sign-up's logo is served by `GET
  /clinic/logo` and counted in `StoredFile`.
- Approve and a parallel `POST /signups` with the same name → never two clinics of that name.
- Two parallel approves of one sign-up → one 201, one 409 "already decided"; no orphan rows (counts).
- A forced failure inside `write` (a `Staff` email clash seeded on purpose) leaves no `ClinicAccount`, no
  `Subscription`, the sign-up still waiting, and the invoice counter unchanged.
- `PUT /operator/signups/:id` re-quotes on a plan change, refuses it once paid (`PAID_PLAN_LOCKED`); reject keeps the
  record and rejects its pending receipt.

#### Phase 6 — Potential Issues

- **`requestContext.within` around `runInTransaction`**: the transaction must be awaited inside (Prisma is lazy, a
  trap); `within` already awaits. The platform rows (`Signup`, `Subscription`) ignore the context's clinic.
- **Deadlock audit:** approve holds platform → signup → new rows; submit and fix hold platform → signup; payment and
  reject hold signup only. No path takes a signup and then the platform lock.
- **Reference collisions** are retried on P2002 of `Signup.reference`; the retry re-runs the transaction body only.
- **`IdentityService` from `SignupsModule`**: `AuthModule` must export it (it exports the limiter since B11); check that
  `AuthModule` doesn't import anything that imports `SignupsModule` (Step 7.1 makes it import
  `SubscriptionRecordsModule`, a leaf — still no cycle).
- **Duplicate check reads every account name** under the platform lock: fine at tens or hundreds of clinics; a
  `nameKey` column on `ClinicAccount` is the later fix (Follow Ups).
- **New pattern flagged:** `UsageService`'s cross-clinic raw `GROUP BY` queries. Why: the operator's list needs every
  clinic's counts and the tenant extension (rightly) refuses a model query without a clinic; one query per measure
  instead of one per clinic avoids N+1.

**Issues identified:** None beyond the duplicate-check scaling note.

### Phase 7: Subscriptions, the console, receipts and the jobs

#### Step 7.1: Subscription writes, settle, the sign-in check, the nightly job

**File:** `apps/api/src/subscription-records/subscription-records.service.ts`, `apps/api/src/subscription-records/subscriptions.jobs.ts` (new), `apps/api/src/subscription-records/subscriptions.jobs.test.ts` (new), `apps/api/src/subscription-records/subscription-records.module.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.module.ts`, `apps/api/src/clinic/limits.ts`, `apps/api/src/clinic/branches.service.ts`, `apps/api/src/clinic/staff.service.ts`
**Verify:** `pnpm run check -- subscriptions.jobs`

Every write runs inside `requestContext.within({ clinicId })` and takes **account → subscription** first (E6).

- `settle(clinicId)`: `lockAccount` → `lock` → `settleStep(sub, account, clock.today())` → apply the patch to
  `ClinicAccount` (tier, status) and `Subscription` (`subscriptionPatch`) → audit "Subscription settled" when not `{}`.
- `settleAll()`: subscription `clinicId`s by cursor (200 a page), one `settle` per clinic, each its own transaction; a
  failure logs the id and the error's name only and the loop goes on. Idempotent: a settled clinic patches `{}`.
- `subscriptions.jobs.ts`: `SETTLE = { name: "subscriptions.settle", leaseMs: 30 * 60_000 }`,
  `@Cron("5 0 * * *", { name, timeZone: "Asia/Manila" })` → `jobs.run(SETTLE, () => records.settleAll())`.
- Sign-in (decision 4, "a check at sign-in"): in `AuthService.login`, after a password opens a match and **before**
  the active check (`auth.service.ts:73`), `settle(match.clinicId)` and re-read `active` for that match. A wrong
  password settles nothing.
- `recordPayment(tx, clinicId, input, receiptId?)` (the mock's `recordSubscriptionPayment`): cancelled → 409; the
  first unpaid month, its `billedTier` and `monthlyFee(tier, periodStart)`; insert the payment and its line
  (`@@unique([clinicId, periodStart])` → P2002 → 409 "This month is already paid."), the invoice number last;
  `paidMonths + 1`; lift an `overdue` pause unless still `lapsed`. Route wrapper `recordByHand(clinicId, input)`.
- `changePlan(clinicId, tier)`: the mock's rule plus decision 12: a downgrade checks `downgradeProblem(tier,
  countUsage(tx))` under the account lock → 409. `cancel(clinicId)`: 409 when already cancelled; `cancelledAt`, clear
  the downgrade, then the settle step in the same transaction. `reactivateRefusal(tx, clinicId)` and `forgetPause(tx)`
  for the operator's reactivate. `waitingDowngrade(tx, clinicId)` for E13.
- `limits.ts` `assertRoomFor(tx, clinicId, limit, downgrade?)` checks against `limitTier(tier, downgrade)`; its two
  callers (`BranchesService`, `StaffService`) pass `await subscriptions.waitingDowngrade(tx, clinicId)` after
  `lockAccount` (account → subscription order holds). `ClinicModule` imports `SubscriptionRecordsModule`.
- `subscriptions.jobs.test.ts` (unit, fakes): the cron runs through `JobRunner` with `SETTLE`; `settleAll` settles
  the clinic after one that throws; a lease skip runs nothing.

#### Step 7.2: The operator console: accounts, tier, suspend, owner, branding, subscription

**File:** `apps/api/src/operator/operator-accounts.service.ts` (new), `apps/api/src/operator/operator-accounts.controller.ts` (new), `apps/api/src/operator/operator.module.ts`, `apps/api/test/operator-routes.test.ts`
**Verify:** `pnpm run check -- operator-routes`

Every route mirrors `features/operator/mocks.ts` (words, statuses); unknown id → 404 "Clinic account not found"
(matched against `ClinicAccount` only). Clinic-data reads and writes run in `requestContext.within({ clinicId })`.

| Route | Status | Service work |
| --- | --- | --- |
| `GET /operator/accounts` | 200 | `AccountOverviewService.of(all)`, sorted by name |
| `POST /operator/accounts` | **201** `CreateAccountResult` | `readSignupForm(CreateAccountInput)`; files first; `lockPlatform` → `duplicateOf` → insert an approved `console` sign-up with its payment and `onFileAgreement` → `ClinicFactory.write`; after commit, the logo copy (Step 6.3's `approve` shape) |
| `PUT /operator/accounts/:id/tier` | 200 overview | `changePlan` (409 words) |
| `GET /operator/accounts/:id/subscription` | 200 `SubscriptionView` | `view` |
| `POST …/subscription/payments` | **201** view | `recordByHand` |
| `POST …/subscription/cancel` | 200 view | `cancel` |
| `POST …/suspend`, `…/reactivate` | 200 overview | `lockAccount` → `lock` → reactivate: `reactivateRefusal` 409, `forgetPause`; status. Staff are out on their next request (identity reads status each time) |
| `GET …/staff` | 200 `OwnerCandidate[]` | active, non-Owner staff with their login email, by name |
| `POST …/owner` | 200 overview | `lockAccount` → `transferProblem` (400) → move `isOwner`; the old Owner keeps branches unless none is open (then every open one, #62) |
| `PUT …/branding` | 200 overview | `designStatus` required (409 the mock's words); `readSignupForm(SetBrandingInput)`; `brandColorProblem` (400 + suggestion); a logo needed until delivered; logo stored (`StorageService.put`, E8) before the transaction; `lockAccount` → swap `logoRef`, colour, font; old logo deleted through the outbox; the sign-up's design → delivered |

- Operator writes are audited in the clinic's trail with the operator as actor (`requestContext.operatorId`).
  Implementer: `AuditService.record` was built for clinic users; if it can't take an operator actor, add one
  (`actorRole: "operator"`, the operator's name) rather than recording a fake staff actor.
- `operator-routes.test.ts`: every route above with and without `pd_operator`.

#### Step 7.3: Receipts: the Owner's, the sign-up's, Payments to check; `/clinic/subscription`

**File:** `apps/api/src/clinic-billing/clinic-billing.controller.ts` (new), `apps/api/src/clinic-billing/clinic-billing.module.ts` (new), `apps/api/src/operator/operator-receipts.controller.ts` (new), `apps/api/src/operator/operator.module.ts`, `apps/api/src/signups/signups.controller.ts`, `apps/api/src/signups/signups.service.ts`, `apps/api/src/subscription-records/subscription-records.service.ts`, `apps/api/src/app.module.ts`, `apps/api/test/receipts-routes.test.ts` (new)
**Verify:** `pnpm run check -- receipts-routes`

The contract is Step 2.2's table. Uploads read with `readUploads({ file: { max: 1, maxBytes: RECEIPT_RULES.maxBytes } })`,
sniffed (`imageProblem` on the sniffed type), stored in `platform/receipts/` **before** the transaction, deleted if
the transaction refuses; temp files disposed in `finally`.

- `ClinicBillingController` (`clinic.manage`): `GET /clinic/subscription` → `view(ownClinicId())`;
  `POST /clinic/subscription/receipts` → `SubscriptionRecordsService.addReceipt(input, file)`: `lockAccount` → `lock`
  → cancelled 409 → `pendingFor` 409 `RECEIPT_PENDING` → insert with `periodStart = unpaidFrom`, `amountDue =
  monthlyFee(billedTier, periodStart)`; **201** view. `GET /clinic/subscription/receipts/:id/image` → 302
  (`fileLink(id, { clinicId: own })`, 404 otherwise).
- `SignupsController`: `POST /signups/:reference/receipts`: `hitRolling(bucketOf("receipt", ip))` first → 429 "Too
  many receipts from this connection. Try again in an hour."; then `lockSignup` → decided / paid / pending 409 →
  insert with `amountDue = quoteTotal`; **201** status view.
- `OperatorReceiptsController`: `GET /operator/receipts` → `pending()`; `GET /operator/receipts/:id/image` → 302;
  `POST …/confirm` and `…/reject` (`@HttpCode(200)`) read the receipt's payer **outside** the transaction (it never
  changes), then dispatch:
  - subscription → `SubscriptionRecordsService.confirmReceipt(clinicId, id, input)`: `lockAccount` → `lock` →
    `ReceiptRecords.lock(id)` → pending (409 "already checked") → `periodStart` is still the first unpaid month (409
    "already paid") → `amountDue` equals that month's fee now (409 "amount due has changed") → `recordPayment(tx, …,
    receiptId)` → `decide(confirmed)`.
  - sign-up → `SignupsService.confirmReceipt(signupId, id, input)`: `lockSignup` → `ReceiptRecords.lock(id)` →
    pending → waiting and unpaid → `payment` from the receipt → `decide(confirmed)`.
  - reject → the same locks for its payer, then `decide(rejected, reason)`.
- `receipts-routes.test.ts`: each receipt route reaches its controller; the clinic ones answer 401 without a session
  and 403 for a front-desk session (`clinic.manage`); the operator ones 401 without `pd_operator`; the public one with
  no cookie at all.

#### Step 7.4: The purge job for rejected sign-ups' files

**File:** `apps/api/src/signups/signups.jobs.ts` (new), `apps/api/src/signups/signups.jobs.test.ts` (new), `apps/api/src/signups/signups.module.ts`
**Verify:** `pnpm run check -- signups.jobs`

- `PURGE = { name: "signups.purge-rejected-files", leaseMs: 30 * 60_000 }`, `@Cron("15 3 * * *", { timeZone:
  "Asia/Manila" })`. `purgeOnce()`: rejected sign-ups with `filesDeletedAt` null and `rejectedAt` old enough
  (`filesDueForDeletion` with `clock.today()`), 100 a batch; per sign-up one transaction: `lockSignup` → still due →
  collect the logo, reference and its receipts' keys → clear them, set `filesDeletedAt` → `storage.delete` outbox rows
  (platform) in the same transaction. The record, its words and its receipts' rows stay (decision 15).
- `signups.jobs.test.ts`: 29 days → kept, 30 → purged (`filesDueForDeletion` boundary through the job); one outbox
  delete per key; a second run purges nothing.

#### Step 7.5: Subscriptions, receipts, the console and the jobs on MySQL

**File:** `apps/api/test/int/subscriptions.int.test.ts` (new), `apps/api/test/int/receipts.int.test.ts` (new), `apps/api/test/int/operator-console.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/receipts.int.test.ts`

- `subscriptions.int.test.ts` (a `FixedClock` per case): the port of `mocks/subscriptions.test.ts`; the nightly job
  pauses a clinic 8 days past due and not one 7 days past; **the sign-in check pauses it before the job runs** (the
  Owner is refused, a parent signs in read-only); a payment lifts its own pause and not a manual one; a price rise
  keeps an overdue month's price; a downgrade over the limits → 409, within them → scheduled, and a branch added while
  it waits → 409; 5 parallel by-hand payments for one month → one row, gapless invoice numbers across two clinics
  paying at once; `settleAll` twice → the second changes nothing.
- `receipts.int.test.ts`: every row of Step 2.2's table; 2 parallel confirms of one receipt → one 200, one 409; 3
  parallel Owner uploads → one pending; a receipt confirm racing a by-hand payment of the same month → exactly one
  payment; Ipin's seeded receipt confirmed lifts its pause and `GET /operator/receipts` empties; another clinic's
  Owner gets 404 for the image; the purge job (clock 31 days on) removes a rejected sign-up's files from the driver and
  keeps the row; the sign-up receipt's 429 after 10.
- `operator-console.int.test.ts`: the list parses with the strict `AccountOverview` and carries counts only (no
  patient field anywhere); direct creation → the Owner signs in; owner transfer; suspend → staff refused at sign-in
  and on their next request, parents read-only; reactivate of a lapsed clinic → 409; branding on a non-designed clinic
  → 409, on Hagikgik after approval → delivered.

#### Phase 7 — Potential Issues

- **`GET /clinic/subscription` was MSW in `hybrid`** (root CONVENTIONS: "The subscription (B12) stays on MSW"). Until
  Phase 9 cuts it over, `hybrid` keeps the mock's; nothing reads both.
- **Sign-in settle cost:** one small transaction per opened match, only after a correct password; the sign-in rate
  limit already bounds it.
- **Job time zone:** `@Cron(…, { timeZone: "Asia/Manila" })` as the birthday job; `leaseMs` 30 min < 24 h period and >
  a run of hundreds of one-row transactions (the job trap).
- **Lock order audit:** confirm (subscription) account → subscription → receipt → (payment insert) → invoice counter;
  Owner upload account → subscription → receipt insert; settle account → subscription; branding account only;
  confirm (sign-up) signup → receipt; purge signup → receipts' rows. Nothing takes a receipt before its payer.
- **Operator audit actor** may need a small `AuditService` change (Step 7.2 note); flagged rather than guessed.
- **Owner transfer** touches `Credential`/sessions? The mock says live sessions pick up roles on the next request;
  the API's `IdentityService.forSession` rebuilds roles from `Staff` each request (verify), so no session work.

**Issues identified:** the audit actor shape (verify in 7.2).

### Phase 8: Storage and text allowances, usage

#### Step 8.1: Storage limit at the ledger

**File:** `apps/api/src/storage/storage.service.ts`, `apps/api/src/storage/storage.test.ts`
**Verify:** `pnpm run check -- storage/storage.test`

- `store(area, ext, body, bytes)` becomes (E8): `runInTransaction` → `lockAccount` → tier (`ClinicAccount`, the
  context's clinic) → `storageRefusal(tier, usedBytes(tx), bytes)` → 409 (`ConflictException`, the shared words) →
  insert the `StoredFile` row → commit → `files.put` → on a failed put, delete the row and rethrow. `delete` keeps its
  order (file, then row). `usedBytes(db = prisma)` takes the transaction client.
- Callers already run `store` before their own transactions (the slow-work rule), so no transaction nests in another.
- `storage.test.ts` (unit, faked Prisma and driver): a put that would pass the plan's bytes by one → 409, no driver
  call, no ledger row; exactly at the limit → stored; a driver failure removes the ledger row; the 409 text equals
  `storageFullMessage(tier)`.

#### Step 8.2: Text allowance at the send claim

**File:** `apps/api/src/message-queue/message-send.handler.ts`, `apps/api/src/message-queue/message-queue.service.ts`, `apps/api/src/message-queue/message-send.handler.test.ts`
**Verify:** `pnpm run check -- message-send`

The claim's new first statements (E9; account → `Message` keeps the global order, and B11's `Message` → `PortalLink`
follows):

```ts
const claim = await runInTransaction(this.prisma, async (tx): Promise<Claim> => {
  const clinicId = await lockAccount(tx); // first: serialises this clinic's claims, so the month's count is exact
  const [m] = await tx.$queryRaw<…>`SELECT status, dispatchedAt, \`to\`, body, kind, linkId FROM Message WHERE id = ${messageId} AND clinicId = ${clinicId} FOR UPDATE`;
  // …existing skip / defer / notConfirmed / noPhone / link checks, unchanged…
  const body = link ? m.body.replace(LINK_MARK, link) : m.body;
  const parts = smsSegments(body);
  const { tier } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
  const refused = textPartsRefusal(m.kind, await this.queue.partsIn(tx, manilaMonth(this.clock.today())), parts, TIER_LIMITS[tier].textParts);
  if (refused) {
    await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: refused }, select: { id: true } });
    return { skip: true }; // decision 19: never sent later, no retry
  }
  await tx.message.update({ where: { id: messageId }, data: { dispatchedAt: now, segments: parts }, select: { id: true } });
  return { send: { number, body, dispatchedAt: now } };
});
```

- Only template kinds can be refused, and they never carry a link (`linkId` is account texts only, B11), so the
  refusal after the link step never wastes a minted token. Keep it after the step so an account text's parts are
  counted with its real link length.
- The release of a definite failure (`dispatchedAt: null`) also clears `segments`, so a released claim doesn't count.
- `MessageQueueService.partsIn(db, month)` = `SUM(segments)` where `dispatchedAt` in the month (this clinic, the tenant
  extension scopes it); `sentIn` stays for the log's numbers.
- `message-send.handler.test.ts`: a reminder that would pass the month's parts → `failed` "Monthly text limit
  reached", no provider call, no retry; a `portal_invite` past the limit → sent; `segments` written at claim; a
  definite provider failure clears both.

#### Step 8.3: `/clinic/usage` and the console read `UsageService`

**File:** `apps/api/src/clinic/clinic.controller.ts`, `apps/api/src/clinic/clinic.module.ts`, `apps/api/src/clinic/limits.ts`, `apps/api/src/clinic/limits.test.ts`
**Verify:** `pnpm run check -- clinic/limits`

- `usageOf(tier, counts, month)` → `ClinicUsage` with all four allowances from `TIER_LIMITS`; `/clinic/usage` reads
  `UsageService.forClinic(ownClinicId(), manilaMonth(clock.today()))`, replacing Step 1.1's stopgap. The console's
  overview already reads `UsageService` (Step 6.2).
- `limits.test.ts`: `usageOf("small", …)` gives `storage.limit = 2 * GB`, `texts.limit = 300` and echoes the month.

#### Step 8.4: Allowances on MySQL, with races

**File:** `apps/api/test/int/allowances.int.test.ts` (new), `apps/api/test/int/owner-settings.int.test.ts`
**Verify:** `test -f apps/api/test/int/allowances.int.test.ts`

- Storage: a `StoredFile` row takes Ngiti to 2 GB − 1 MB; 3 parallel 600 KB photo uploads → exactly one stored, two
  409 with the words, the ledger never above the limit; a logo upload when full → 409 and the old logo still served.
- Texts: Ngiti at 299 parts this Manila month; two queued 1-part reminders drained in parallel by `worker.drain()` →
  one sent, one failed "Monthly text limit reached"; a portal invite then still sends; parts dispatched on the last
  day of the previous month don't count (`FixedClock` at 00:30 on the 1st, Manila).
- `/clinic/usage` and the operator's overview agree on storage and texts for Ngiti.
- `owner-settings.int.test.ts`: the `ClinicUsage` expectations gain the new keys.

#### Phase 8 — Potential Issues

- **The send claim now locks the clinic's account row.** All of one clinic's sends serialise for the length of the
  claim (milliseconds; the provider call is outside it). An account write (a booking holds `lockAccount`) delays a
  claim by its length. Acceptable at clinic volumes; the alternative (a per-clinic counter row) is a new lock in the
  order and isn't needed yet.
- **E8 flips B10's ledger order** (row first, then file): a crash between leaves an over-count until a cleanup;
  record it in the API CONVENTIONS trap replacing B10's "after the file" note.
- **Seeded clinics' usage** includes the seeded photos' bytes (B10 seed ledger), so demo numbers aren't zero.

**Issues identified:** the send-claim lock's throughput cost (accepted, recorded).

## B12d: Cut-over

### Phase 9: `API_ROUTES`, the e2e spec, docs

#### Step 9.1: The B12 routes in `API_ROUTES`

**File:** `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`
**Verify:** `pnpm run check -- passthrough`

- Add, under `// B12: …`: every `OPERATOR_RULES` route (accounts, tier, subscription, payments, cancel, suspend,
  reactivate, staff, owner, branding, signups and their files, fix, payment, reject, approve, prices, payment-qr,
  receipts and their image, confirm, reject), every `PUBLIC_RULES` sign-up route (`/signups/prices`, `POST /signups`,
  `GET /signups/:reference`, `POST /signups/:reference/receipts`, `GET /signups/payment-qr/image`) and `GET
  /clinic/subscription`, `POST /clinic/subscription/receipts`, `GET /clinic/subscription/receipts/:id/image`. Remove the
  file comment's "`GET /clinic/subscription` (B12) stays mocked".
- `passthrough.test.ts`: every operator rule and every public sign-up rule is in `API_ROUTES` (a sweep over the two
  rule lists, so a future route can't be forgotten).

#### Step 9.2: `e2e/api-operator.spec.ts`

**File:** `apps/web/e2e/api-operator.spec.ts` (new)
**Verify:** `test -f apps/web/e2e/api-operator.spec.ts`

Header: start-up commands (fresh database with B12's rows, `DEMO_LOGINS=true`, `STORAGE_DIR`, `STORAGE_LINK_SECRET`,
`WEB_URL`), sign-ins per run, "clear `RateLimitCounter` between specs". Tests (each tells an API answer by its
`x-request-id` header): the operator signs in, uploads a QR with a caption; a visitor submits Get started (a fresh name
per run, so it re-runs on one database), sees the QR and amount, uploads a receipt, sees "Primolar is checking"; the
operator sees the count, confirms, approves, reads the temporary password; the new Owner signs in, sets a password,
acknowledges, sees Settings → Plan with Storage and Texts; Ngiti's Owner (due in 2 days, so signed in and not paused)
uploads a receipt on the Plan tab, the operator rejects it with a reason, the Owner reads the reason and uploads again
(decision 21), and the operator confirms it. No test moves the clock, so the spec re-runs on one database.

#### Step 9.3: Both CONVENTIONS, CHUNKS ✅, `.env.example`

**File:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`, `apps/api/.env.example`

- Root `CONVENTIONS.md`: "since B12, the operator console, sign-ups, subscriptions, receipts and the QR" in the
  hybrid lists (Commands row, Traps' hybrid paragraph; drop "The subscription (B12) stays on MSW"); Domain rules: the
  allowances (storage at upload, texts at send in the API and at queue in the mock), price changes from the next due
  date (`priceOn`), downgrades refused over the limits, receipts (Owner and operator only); a Commands row for
  `e2e/api-operator.spec.ts`; the mock key v31 in Traps; the guard's new files.
- `apps/api/CONVENTIONS.md`: "Current phase: B1–B12 done"; Where things live rows for `platform-settings`,
  `subscription-records`, `receipt-records`, `signups`, `operator`, `clinic-billing`, `usage`, `PlatformFilesService`,
  `readUploads`; Traps: E6's lock order, the send claim's account lock (E9), the ledger order (E8), `platform/*` in the
  S3 policy, both jobs and their times, "a database seeded before B12 has no billing rows", sign-ups and receipts
  rate limits (and `trust proxy`, B13); Decisions recorded: E1–E13 by name.
- `CHUNKS.md`: B12 ✅ with the date, the sub-chunks, the done-when proofs (test file per claim), and what was
  deferred (S3 policy at go-live; PayMongo, BIR, two-step operator sign-in stay later chunks).
- `.env.example`: nothing new expected; say so in the log if unchanged.

#### Phase 9 — Potential Issues

- The e2e needs the operator's demo login on the API (`OperatorUser` seeded since B2) and a fresh sign-up name per run.
- Running the e2e after other API specs can trip the sign-in limit (CONVENTIONS); the spec's header says to clear
  `RateLimitCounter`.

**Issues identified:** None.

## 3. Related Files

Read for this plan (reviews in `references/` where a file is long; the rest cited by path):

- Spec (mock): `apps/web/src/mocks/signups.ts`, `apps/web/src/mocks/subscriptions.ts`, `apps/web/src/features/operator/mocks.ts`,
  `apps/web/src/features/operator/signup-mocks.ts`, `apps/web/src/features/signup/mocks.ts`, `apps/web/src/mocks/access.ts`
  (rules, gate), `apps/web/src/features/clinic/mocks.ts` (usage, subscription), `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/db.ts`.
- Shared: `packages/shared/src/domain/{signup,subscription,tenancy,sending}.ts`, `packages/shared/src/schemas/{signup,subscription,operator,tenancy,message,billing}.ts`.
- Seed: `packages/seed/src/{seed-signups,seed-subscriptions,platform}.ts`.
- API: `apps/api/src/storage/{storage.service,storage,multipart}.ts`, `apps/api/src/message-queue/{message-queue.service,message-send.handler}.ts`,
  `apps/api/src/auth/{access-rules,rate-limit,auth.service,identity.service,access.guard}.ts`, `apps/api/src/jobs/job-runner.ts`,
  `apps/api/src/clinic/{limits,account-lock,staff.service}.ts`, `apps/api/src/common/request-context.ts`,
  `apps/api/src/prisma/model-scope.ts`, `apps/api/prisma/schema.prisma`.
- Web screens: `apps/web/src/features/clinic/components/plan-panel.tsx`, the operator components list, `apps/web/src/features/signup/components/signup-status-screen.tsx`.

## 4. Follow Ups

### Amendment after planning: decision 25 (the user chose A, 2026-10-18)

Question 1 below is settled the other way: **the Owner of a clinic paused for an unpaid subscription (`pause: "overdue"`)
signs in to a billing-only session.** Implemented in three added steps (the implementer writes them; recorded in the
implementation log):

- **2.6 (mock):** sign-in lets that Owner in (staff with `clinic.manage` only; other staff refused as today; a manual
  suspension or a cancelled subscription still refuses everyone but parents). `SessionUser.billingOnly: true` is
  derived per request from the account (`status: suspended` + `pause: overdue`). The gate lets a billing-only session
  reach only `/auth/*`, `GET /clinic`, `GET /clinic/logo`, `GET /clinic/subscription`, `POST /clinic/subscription/receipts`
  and the receipt image; every other route answers 403 "Your clinic is paused until the Primolar subscription is paid.
  Pay in Settings → Plan to reopen it." Confirming the receipt lifts the pause, so the next request is a full session.
- **3.5 (web):** a billing-only session sees one screen: the Plan panel (pay by QR, receipt upload, history) with a
  short explanation and Sign out; no nav.
- **7.6 (API):** the same: `ClinicIdentity.billingOnly`, set in `forSession` from the account and subscription; the
  sign-in check lets the Owner through; the guard allows only the routes above. Tests on MySQL: the Owner of a lapsed
  clinic signs in, can upload a receipt, gets 403 elsewhere; front desk is refused; after the operator confirms, the
  Owner's next request is a full session.

### Questions / Clarifications

1. **(Settled: see the amendment above.) A paused Owner can't sign in to send a receipt** (decision 4 vs 6). **Recommended:** keep decision 4; make the
   sign-in refusal for a *subscription* pause say "Your clinic is paused for an unpaid Primolar subscription. Send your
   payment receipt to Primolar to reopen it." and let the operator record it by hand (existing route). Alternative: let
   a lapsed Owner sign in to the Plan tab only (a new restricted session mode; more work, B13 at the earliest).
2. **Decision 12 while a downgrade waits** (E13): the plan checks additions against the smaller plan once a downgrade
   is scheduled, so it can't drift over before its date. **Recommended:** yes (planned). If not, the settle step must
   decide what happens to a downgrade that arrives over the limits (apply anyway or cancel it).
3. **Which texts stop at the limit** (decision 3 "automatic reminders"; 19 "reminders"). The plan stops **every clinic
   template text** (confirmations, reminders, aftercare, missed-appointment, recall, birthday) and never account
   texts. **Recommended:** as planned, since every template text costs the same parts; the alternative (only
   `appointment_reminder`/`follow_up_reminder`/`recall`/`birthday`) is a one-line set in `textPartsRefusal`.
4. **Receipts of rejected *subscription* payments**: decision 15 deletes only rejected sign-ups' files. **Recommended:**
   keep them (they are the clinic's payment record and small; not counted toward storage). Revisit with BIR.
5. **QR image size**: 2 MB planned (`QR_RULES`); a phone screenshot of a GCash QR is well under that. Confirm or raise
   to 5 MB like receipts.
6. **Seeded demo state**: no QR (decision 23 visible) and one pending receipt for Ipin. **Recommended** as planned;
   the e2e uploads a QR itself.

### Issues Found

| Phase | Issue | Severity | Status |
| --- | --- | --- | --- |
| 1 | Widened strict views need placeholder usage values for one phase | Low | Planned (replaced in 2.5 / 8.3) |
| 2 | A pending receipt can outlive a by-hand payment of its month; confirm refuses "already paid" | Low | Accepted |
| 2 / 8 | The mock counts texts at queue time, the API at dispatch | Low | By design (the mock never sends) |
| 5 | S3 IAM policy allows `clinics/*` only; `platform/*` must be added before go-live | High at go-live | For B13's go-live list |
| 6 | Duplicate check reads every account name under the platform lock | Low now | Later: indexed `nameKey` on `ClinicAccount` |
| 7 | `AuditService` may not take an operator actor | Medium | Verify in Step 7.2 |
| 8 | Send claims serialise per clinic on the account row | Low | Accepted, recorded in API CONVENTIONS |
| 8 | Ledger written before the file (over-count on crash) | Low | Accepted, trap updated |
| — | Root CONVENTIONS says the subscription stays on MSW in `hybrid`; true until Phase 9 | — | Updated in 9.3 |
