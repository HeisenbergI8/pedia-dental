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

## Phase 4: The S3 driver and its configuration — 2026-10-17

**Steps completed:** 4.1, 4.2, 4.3.
**Files changed:** `apps/api/package.json` (+ lockfile: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` 3.1152.0, `busboy`, `@types/busboy`),
`src/config/{env,env.test}.ts`, `.env.example`, `src/storage/{s3.storage,s3.storage.test,file-storage,file-storage.test}.ts` (new), `storage.module.ts`.
**Deviations from plan:** versions written as `^3` like the repo's other majors. The env defaults test lists `S3_REGION`
and `S3_FORCE_PATH_STYLE`.
**Gate:** `pnpm run check` exit 0.

## Phase 5: readUpload, sniffing, the patient photo off multer — 2026-10-17

**Steps completed:** 5.1, 5.2, 5.3.
**Files changed:** `apps/api/src/storage/{sniff,multipart,multipart.test}.ts` (new), `src/patients/{patient-photo,patient-photo.test,patients.controller,patient-writes.service,patients.service}.ts`,
`test/int/patient-photo.int.test.ts`.
**Deviations from plan:** busboy flags a part that *reaches* `fileSize`, so `readUpload` reads up to `maxBytes + 1` and
decides `tooLarge` from its own count (a file of exactly the limit passes, as the mock); `files: 3` so a stray file field
can't crowd out `file`. The patient photo GET uses `@Res()` without passthrough for the redirect. Mutation: no
`dispose()` → the no-temp-file case red.
**Gate:** `pnpm run check` exit 0 · `test:int test/int/patient-photo.int.test.ts` 9 passed.

## Phase 6: PhotosModule — 2026-10-17

**Steps completed:** 6.1, 6.2, 6.3.
**Files changed:** `apps/api/src/photos/{photo-file,photo-file.test,photo.rows,photos.service,photos.controller,photos.module}.ts` (new), `src/app.module.ts`,
`test/clinical-routes.test.ts` (3 photo routes), `test/int/support/files.ts` and `test/int/photos.int.test.ts` (new).
**Deviations from plan:** `patientOf`/`fileLink` use `findFirst` (tenant-scoped like the rest). The file route redirects
with `@Res()` (no passthrough). `patient-photo.int` keeps its own `open` helper (it also needs the clock); `files.ts`
serves the photos file. Mutation: the in-transaction consent re-check removed → the E6 race case red.
**Gate:** `pnpm run check` exit 0 · `test:int test/int/photos.int.test.ts` 12 passed.

## Phase 7: DocumentsModule — 2026-10-17

**Steps completed:** 7.1, 7.2, 7.3.
**Files changed:** `apps/api/src/documents/{documents.rules,documents.rules.test,document.rows,documents.service,documents.controller,documents.module}.ts` (new),
`src/clinic/clinic.service.ts` (`staffRoles`), `src/notes/notes.service.ts` (`signedProcedure`), `src/app.module.ts`, `test/clinical-routes.test.ts`,
`test/int/documents.int.test.ts` (new).
**Deviations from plan:** case 7 (a read-only session still issues a document) isn't reachable: `readOnly` is set only
for a suspended clinic's parents, who don't hold `documents.issue`; the guard's `exportRead` rule is unit-tested already.
The tests use a pulpotomy-free extraction note (`teeth`, `reason`) per the seeded template, and Midazolam as the S2 drug.
**Gate:** `pnpm run check` exit 0 · `test:int test/int/documents.int.test.ts` 8 passed (after Phase 8's seed).

## Phase 8: The API seed — 2026-10-17

**Steps completed:** 8.1, 8.2.
**Files changed:** `apps/api/src/seed/seed-database.ts`, `prisma/seed.ts`, `test/int/seed.int.test.ts`.
**Deviations from plan:** none (the new seed case reseeds with a `LocalDiskStorage`, then without one).
**Gate:** `pnpm run check` exit 0 · `pnpm --filter api test:int` 41 files, 460 passed.

## Phase 9: Cut-over — 2026-10-17

**Steps completed:** 9.1, 9.2, 9.3.
**Files changed:** `apps/web/src/mocks/{passthrough,passthrough.test}.ts`, `apps/web/e2e/api-photos-documents.spec.ts` (new),
`CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`.
**Deviations from plan:** the spec signs in as the admin, not the dentist (the dentist's email is at two clinics, so
sign-in stops at a clinic picker). Inside the page, MSW's service worker follows the 302 itself, so the page sees the
`<img>`'s final 200; the 302 is asserted through Next's proxy with `page.request` (`maxRedirects: 0`), which also proves
the proxy passes a 302 (plan Question 6, local driver). Setup writes, the parent upload, the documents issue and the
prescription refusal go through `page.request`; the photo uploads, the PDF Open/Download, the declined family's words,
the documents page and the image rendering go through the UI.
**E2E:** fresh database `pedia_dental_e2e_b10`, seeded with `STORAGE_DIR=var/e2e-b10` (13 files written by `db:seed`
through the local driver), API on 4150 with `STORAGE_LINK_SECRET`, web on 3190 in `hybrid`. Run 1: 6 passed. Run 2 on the
same database: 6 passed; `api-patients.spec.ts` (the avatar now through a 302): 5 passed. **Restart (done-when):** the
container restarted (my process-stop command matched the session's own parent; nothing in the tree was lost); on a
fresh API process the photo uploaded before it (`hpypy39…`) answered 302 then 200 `image/jpeg` (762 bytes), and run 3
passed 6. Servers then stopped by their own process trees; `tsconfig.json` reverted; the temporary config deleted.
**Gate:** `pnpm run check` exit 0.

## Review fixes (tester) - 2026-10-17

- **D1 (low-medium):** a multipart type with no usable boundary threw inside `busboy(...)` outside the try, giving a
  500. Now 400 "The upload didn't arrive whole. Try again." (`multipart.ts`, unit and int cases).
- **D2 (medium):** `takenOn: "2026-13-45"` reached Prisma (500) after the file was stored, leaving an orphan file and a
  ledger overcount; `2026-02-30` was stored as March 2. The shared `isoDate` now refuses a day that doesn't exist (one
  rule for the demo and the API; `common.test.ts`). Any failure after `putFile` now removes the stored file (photos and
  the patient photo). Mutation: without the removal, the "row can't be written" int case is red.
- **D3 (low):** a 255-character patient id on the photo and document lists answered 500 (P2000); an id longer than any
  stored one now lists `[]`, as an unknown id. The same pattern on older routes (visits, notes, growth, plan, chart) is
  pre-existing and out of B10's scope.
- The 14 stale files the tester saw under `primolar-uploads` came from my Phase 5 mutation run (the `dispose()` removal);
  removed. **Gate:** `pnpm run check` exit 0; `test:int test/int/photos.int.test.ts` 14 passed.

## Auditor fixes (2026-10-17, score 77/100 before fixes)

- **Link token named the child** (local driver): the token is now AES-256-GCM encrypted (iv, tag, ciphertext;
  key = sha256 of `STORAGE_LINK_SECRET`), so no key or name shows in a URL or a log. Opacity test added. The S3
  presigned link still names the download file in `response-content-disposition`; accepted and documented (it goes
  only to the signed-in browser).
- **Two surviving mutations**: a credit-transfer receipt case (documents.int) and a no-Content-Length size-guard case
  (multipart.test). Both went red under their mutation, then the source was restored.
- **S3 never run against a real store**: the client now sends checksums only when required (R2/MinIO compatibility).
  CHUNKS "done when" says the S3 path is unit-tested only; a MinIO/S3 run is a go-live check.
- **E2E gaps recorded**: the avatar upload and the receipt download aren't driven through the browser (MSW's worker
  follows the 302); they are covered by the int tests.
- **Docs**: stale markers in `env.ts`, `seed-database.ts`, `ROADMAP.md`; bucket notes (versioning, no expiry, IAM
  scope); E13 in the decisions block.
- **Smells**: the misplaced JSDoc in `clinic.service.ts` moved back; one `StorageService.keepIf` replaces the two
  remove-on-failure copies; one shared `ID_MAX` (`common/ids.ts`, also used by messages); patient-photo.int uses
  `support/files`.
