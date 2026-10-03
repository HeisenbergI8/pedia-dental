# Implementation log: ROADMAP Chunks 11 and 12

Plan: `chunks-11-12-plan.md`. Baseline is the dirty tree with the uncommitted UI-polish / plain-language-error
work (modified before 2026-10-03 10:10, not part of this plan: `providers.tsx`, `shared/domain/notes.ts`,
`shared/schemas/{chart,common,patient,photo,plan}.ts` and the files listed in the plan's baseline). Defaults
taken for the plan's open questions: Q4 deposits deferred (take a deposit as a payment on the first invoice),
Q8 no 3-month rule added, Q3 a follow-up walk-in does not close open follow-ups, Q7 receipt header "Pedia Dental" only.

## Phase 1: Due items, shared contract and rules (Chunk 11) — 2026-10-03

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/schemas/recall.ts` (new), `packages/shared/src/index.ts`, `packages/shared/src/domain/recall.ts`, `packages/shared/src/domain/recall.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check` — pass (shared 38/38, web 29/29)
**Notes:** buckets are rolling windows (overdue / 0–7 / 8–30 days), not calendar weeks.

## Phase 2: Due items, mock backend (Chunk 11) — 2026-10-03

**Steps completed:** 2.1, 2.2, 2.3, 2.4
**Files changed:** `apps/web/src/mocks/{db,seed,handlers,handlers.test}.ts`, `apps/web/src/features/notes/mocks.ts`, `apps/web/src/features/recalls/mocks.ts` (new), `apps/web/src/features/appointments/mocks.ts`
**Deviations from plan:** the sign handler hoists `const signedAt` (the fallback the plan itself named) instead of relying on narrowing of `note.signedAt`.
**Gate:** `pnpm run check` — pass (shared 38/38, web 31/31)
**Notes:** mock DB key v8 → v9. Due date uses the visit date, not the signing date.

## Phase 3: Recalls page (Chunk 11) — 2026-10-03

**Steps completed:** 3.1, 3.2, 3.3, 3.4
**Files changed:** `apps/web/src/features/recalls/api.ts` (new), `apps/web/src/features/recalls/components/recall-list.tsx` (new), `apps/web/src/features/appointments/api.ts`, `apps/web/src/features/notes/api.ts`, `apps/web/src/features/appointments/components/appointment-form.tsx`, `apps/web/src/app/(clinic)/recall/page.tsx`, `apps/web/src/components/app-shell.tsx`
**Deviations from plan:** none. ui-ux-design skill loaded first; the planned component was kept as written (patient name + guardian phone per row for the front-desk calling task, one primary "Book" per row, a single EmptyState when all three lists are empty).
**Gate:** `pnpm run check` — pass (38/38, 31/31); `pnpm --filter web lint` — pass
**Notes:** the browser walkthrough (manual gate) was not run by the implementer; left for the tester.

## Phase 4: Billing, shared contract and money rules (Chunk 12) — 2026-10-03

**Steps completed:** 4.1, 4.2, 4.3
**Files changed:** `packages/shared/src/schemas/billing.ts`, `packages/shared/src/domain/money.ts`, `packages/shared/src/domain/money.test.ts`
**Deviations from plan:** none
**Gate:** `pnpm run check` — pass (shared 41/41, web 31/31)
**Notes:** `CreateInvoiceInput` exports its `z.input` type (discount optional for callers), the first `z.input` export in the repo, as the plan flagged.

## Phase 5: Billing, mock backend (Chunk 12) — 2026-10-03

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `apps/web/src/mocks/{db,seed,handlers,handlers.test}.ts`, `apps/web/src/features/billing/mocks.ts` (new)
**Deviations from plan:** none
**Gate:** `pnpm run check` — pass (shared 41/41, web 33/33)
**Notes:** mock DB key v9 → v10. Invoices and payments are seeded empty (Q5). The ₱8,500 test uses a fresh patient; the seeded example patient stays at 3 of 6 done for the Chunk 9 test.

## Phase 6: Billing screens (Chunk 12) — 2026-10-03

**Steps completed:** 6.1, 6.2, 6.3, 6.4
**Files changed:** `apps/web/src/features/billing/api.ts` (new), `apps/web/src/features/billing/components/{billing-tab,create-invoice,payment-dialog,receipt,collections-list}.tsx` (new), `apps/web/src/features/patients/components/patient-record.tsx`, `apps/web/src/app/(clinic)/patients/[patientId]/receipts/[paymentId]/page.tsx` (new), `apps/web/src/app/(clinic)/billing/page.tsx`, `apps/web/src/components/app-shell.tsx`
**Deviations from plan:** none. The ui-ux-design skill was loaded and the planned components were checked against its non-negotiables: PatientHeader on screen for every patient screen (hidden only in print on the receipt), refunds labelled in text and not by colour alone, money through `formatPeso` with `tabular-nums` and right-aligned, a refund needs a stated reason, and only existing tokens are used. They were kept as written.
**Gate:** `pnpm run check` — pass (shared 41/41, web 33/33); `pnpm --filter web lint` — pass
**Notes:** the manual browser walkthrough (390px layout, print preview showing only the receipt, the `print:hidden!` precedence on the sidebar) was not run by the implementer and is left for the tester. Plan steps not implemented: none.
