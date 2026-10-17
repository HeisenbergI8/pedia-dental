# Implementation log: Chunk B10, photos and documents

Plan: `feature-chunk-b10-photos-documents-plan.md`. One entry per phase, in B9's shape. Record deviations from the
plan as they happen, with the reason, or "none" when there are none. Record every `pnpm --filter api test:int <file>`
run by hand: `test:int` isn't on the check allowlist, so the plan's `test -f` gates prove only that a file exists.

## Decisions settled with the user — 2026-10-17 (`decisions.md`)

1. Amazon S3 in ap-southeast-1 in production, through an S3-compatible driver (R2 by config). Dev and tests use local
   disk.
2. Uploads go through the API: checked (size, type), then streamed to storage. Never held whole in memory. No
   presigned uploads. **This overrides CHUNKS B10's "presigned uploads".**
3. Opening a file gives a private link valid 5 minutes. No clinic can open another clinic's file, even with its key.
4. Limits as the demo: 10 MB; images only; PDFs only for `document` and `referral`.
5. No delete: photos are part of the medical record.
6. PDFs are built in the browser. The server keeps only the issued-document log, with the issuer, source and allergy
   checks. No PDF is stored.
7. Parent uploads as the demo: intraoral, extraoral and medical documents; no X-rays; blocked when the family declined
   photos.
8. Count each clinic's stored bytes. No limit until B12.

**Open for the user** (plan → Follow Ups → Questions 1–6). The plan is written to the recommendations:
- The bytes count is shown nowhere until B12.
- No backfill of the ledger.
- An IAM role for S3 in production.
- The bucket setup before go-live.
- A deactivated dentist still counts as an issuer.
- One manual MinIO run to confirm a cross-origin 302 renders.

Engineering decisions E1–E14 and contract changes C1–C4 are as the plan records them.

<!-- Template for each phase:
## Phase N: <name> — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check` (exit, test files counted) · `pnpm --filter api test:int <files>` (exit)
-->

## Manual checks to record

- [ ] Step 5.3: `test:int test/int/patient-photo.int.test.ts`
- [ ] Step 6.3: `test:int test/int/photos.int.test.ts`. The mutation for case 7 (remove the in-transaction consent
      re-check) turns it red.
- [ ] Step 7.3: `test:int test/int/documents.int.test.ts`
- [ ] Step 8.2: `test:int test/int/seed.int.test.ts`
- [ ] Step 9.2: e2e twice on one database, plus the restart re-run of test 1. Re-run `api-patients.spec.ts`.
- [ ] Question 6: one MinIO run (`S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true`). Photos open through a
      cross-origin 302 in `hybrid`.

## Questions 1–6 (plan Follow Ups) — 2026-10-17

The user asked for the whole chunk to be planned and built without stopping; the plan's recommendations stand: the
stored-bytes count shows nowhere until B12; no backfill for files stored before B10; S3 credentials from the SDK's
default chain (IAM role) in production, static keys only for R2/MinIO; bucket in ap-southeast-1 with Block Public
Access, SSE-S3, versioning, no CORS; documents may name a deactivated dentist as in the demo; one manual MinIO run
before go-live to confirm a cross-origin 302 renders.

## Phase 1: Shared rules, the mock and the web's Download link — 2026-10-17

**Steps completed:** 1.1, 1.2, 1.3.
**Files changed:** `packages/shared/src/domain/{photos,photos.test}.ts`, `packages/shared/src/schemas/photo.ts`, `apps/web/src/features/photos/{mocks,api}.ts`,
`components/file-card.tsx`, `file-url.test.ts` (new), `apps/web/src/mocks/handlers.test.ts`.
**Deviations from plan:** the handlers assertion matches `inline; filename=".+\.pdf"` (the test's patient isn't a fixed name).
**Gate:** `pnpm run check` exit 0.

## Phase 2: Seeded photos and documents — 2026-10-17

**Steps completed:** 2.1, 2.2.
**Files changed:** `packages/seed/src/{seed-files,seed-photos}.ts` (new), `seed.ts`, `index.ts`, `seed.test.ts`; `apps/web/src/features/photos/mocks.ts`,
`apps/web/src/mocks/{db,handlers.test}.ts`.
**Deviations from plan:** the seeded bytes go into a `Blob` as `seeded.slice()` (TS's `BlobPart` refuses
`Uint8Array<ArrayBufferLike>`). `seed.test.ts`'s first-patient assertions unchanged (faker order intact).
**Gate:** `pnpm run check` exit 0 (shared 209, seed 25, web 360, api 345).

## Phase 3: Tables, streaming put, links and the ledger — 2026-10-17

**Steps completed:** 3.1, 3.2, 3.3, 3.4.
**Files changed:** `apps/api/prisma/schema.prisma`, `migrations/20261017105005_b10_photos_documents/`, `src/prisma/{model-scope,tenant-scope.test}.ts`,
`src/storage/{storage,local-disk.storage,storage.service,storage.module,storage.test}.ts`, `local-links{,.test}.ts` and `local-files.controller.ts` (new),
`src/auth/access-rules{,.test}.ts`, `src/app.module.ts`, `test/clinical-routes.test.ts`.
**Deviations from plan:** `tenant-scope.test.ts` also checks the new Prisma enums against the shared ones (as B9 did).
`storage.test.ts`'s fake ledger scopes by the request's clinic, so `usedBytes` per clinic is tested at unit level too.
**Gate:** `pnpm run check` exit 0 (api 353) · `test:int` clinic-branding, patient-photo, tenancy: 18 passed.
