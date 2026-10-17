# Plan: Chunk B10: photos and documents

## 1. Plan Overview

- **Plan Type:** feature
- **Description:** Moves clinical photos, the issued-documents log and the patient photo's bytes into apps/api, on
  real object storage. An S3-compatible driver (AWS SDK v3; Amazon S3 in ap-southeast-1 in production, R2 or MinIO by
  config) joins the B1-c local-disk driver, picked by `S3_BUCKET`. Uploads travel **through the API** (decision 2): the
  multipart body is streamed by busboy, the file part is spooled to a temporary file in 64 KiB chunks (never whole in
  memory), every check runs in the mock's order (size, claimed type, the bytes' real type, consent, parent rules, the
  visit), and only then is the file streamed to storage under a clinic-scoped key. Opening a file (decision 3) answers
  a `302` to a private link valid 5 minutes: a presigned GET on S3, an HMAC-signed `/api/files/<token>` on local disk.
  Photos and documents are append-only (decision 5). The document log keeps the mock's checks in order (issuer, source,
  allergy) and stores no PDF (decision 6). Each clinic's stored bytes are counted in a `StoredFile` ledger (decision 8).
  The patient photo leaves multer's memory storage. The seed gains photos (with tiny real files) and documents. Then
  the 6 routes plus the file-link route are served in `hybrid`, and `e2e/api-photos-documents.spec.ts` drives them.
- **Date:** 2026-10-17

### Starting state

Branch `feature/b10-photos-documents`, B1–B9 merged. **The six B10 routes already have their access rules**
(`apps/api/src/auth/access-rules.ts:63–65` photos, `:92–94` documents), equal to the mock's `RULES`
(`apps/web/src/mocks/access.ts:187–189, 228–230`). No `ClinicalPhoto` or `PatientDocument` model exists. Storage is
B1-c's: `FileStorage` (`put(key, Buffer)`, `get`, `delete`), `LocalDiskStorage`, `StorageService` (clinic-scoped keys,
`STORAGE_AREAS = ["branding", "patients"]`) and the `storage.delete` outbox handler
(`references/storage-review.ts`). The patient photo (B4e) and the logo (B3) go through multer memory storage
(`patients.controller.ts:93–97`, `clinic.controller.ts:101–106`); the patient photo is served as bytes
(`patients.controller.ts:102–108`, `references/patient-photo-review.ts`). The seed has `photos: []` and
`documents: []` for every clinic (`packages/seed/src/seed.ts:269, 275`). The web opens files only through `<img src>`
and `<a href>` (`photos-tab.tsx:46, 54, 56, 165–167`, `file-card.tsx:7–14`, `patient-avatar.tsx:26`); nothing fetches a
photo with `fetch()` or draws it into a canvas. The **logo** is drawn into a canvas (`documents/download.ts:9–23`).
CONVENTIONS markers "until B10": root `CONVENTIONS.md:175–179`; `apps/api/CONVENTIONS.md:170, 266, 279–280, 293–294,
304–305, 313–314, 394`; `passthrough.ts:76, 100`; `passthrough.test.ts:73–77`. References: `references/`.

### Sub-chunks (each ends green: `pnpm run check`, and from B10b on `pnpm --filter api test:int`)

| Sub-chunk | Phases | What it delivers |
| --- | --- | --- |
| **B10a** Contract and seed | 1–2 | `FILE_LINK_SECONDS`, `photoFileName` and the 302 note in `@pedia/shared`; `?download=1` in the mock and the web; seeded photos (with files) and documents for MSW |
| **B10b** Storage | 3–4 | `StoredFile`, `ClinicalPhoto`, `PatientDocument` + migration; streaming `put`, `link`, the local signed link route; the S3 driver and env |
| **B10c** Streaming uploads | 5 | `readUpload` (busboy → temp file), `sniff`; the patient photo off multer, served by a 302 |
| **B10d** Photos | 6 | `PhotosModule`: list, upload, open; consent under the patient's lock; cross-clinic and restart proofs |
| **B10e** Documents | 7 | `DocumentsModule`: the log, the per-child list, issuing with the mock's checks in order |
| **B10f** Seed and cut-over | 8–9 | The API seed's photos, files and documents; `API_ROUTES`, the e2e spec, CONVENTIONS (both) and CHUNKS |

### Product decisions (settled in `decisions.md`, 2026-10-17; not re-asked)

1. Amazon S3 in Singapore (ap-southeast-1) in production, through an S3-compatible driver (R2 possible by config);
development and tests keep the local-disk driver. 2. Uploads travel through the API: checked (size, type), then
streamed to storage, never buffered whole in memory; the upload contract and screens stay as the demo's; no presigned
uploads. 3. Opening a file: a private link valid 5 minutes; one clinic can never open another clinic's file, even with
its key. 4. Limits as the demo: 10 MB, images only, PDFs only for `document` and `referral`. 5. No delete: photos are
part of the medical record. 6. PDFs stay built in the browser; the server keeps only the issued-document log, with the
demo's checks (issuer, source, allergy); no PDF stored. 7. Parent uploads from the portal as the demo (intraoral,
extraoral, medical documents; no X-rays), blocked when the family declined clinical photos. 8. Count each clinic's
stored bytes; no limit in B10.

**Decision 2 overrides `apps/api/CHUNKS.md` B10** ("presigned uploads and downloads, so files go straight between the
browser and storage") and `apps/api/CONVENTIONS.md:170` ("Files go to object storage through presigned URLs, never
through the API's memory"). Step 9.3 rewrites both.

### Engineering decisions (recorded; no owner input needed unless listed in Questions)

- **E1. Spool, check, then store (new pattern, flagged).** `readUpload(req, { maxBytes })` (`src/storage/multipart.ts`)
  parses the multipart body with busboy. Text fields are capped at 64 KiB. The one `file` part is piped to a temporary
  file under `os.tmpdir()/primolar-uploads/`, counting bytes and keeping the first 16 for sniffing; busboy's `fileSize`
  limit stops writing at the limit and marks `tooLarge`. Memory per upload is one stream chunk (64 KiB), whatever the
  file's size. Once the body is read, the service runs the mock's checks **in the mock's order**. Only a file that
  passed every check is streamed from the temp file to storage, with its known length. The temp file is removed in
  `finally`. **Why not pipe the request straight into S3:** the web sends `file` before `meta` (`photos/api.ts:28–31`),
  and the mock decides consent, parent rules and the visit from `meta`, so a direct pipe would put refused files into
  the bucket and then have to delete them. S3's `PutObject` also needs a length, and a streamed multipart upload
  without one holds a 5 MiB part in memory. Spooling keeps the contract, the mock's order and decision 2's "checked,
  then streamed".
- **E2. Opening a file is a 302 to a 5-minute link.** `GET /photos/:id/file` and `GET /patients/:id/photo` check access
  and write their audit entry. They then answer `302 Location: <link>` with `Cache-Control: no-store`, so every open
  is checked again. `FILE_LINK_SECONDS = 300` (shared). On S3 the link is a presigned `GetObject` with
  `ResponseContentType` and `ResponseContentDisposition` (the mock's readable file name). On local disk it is
  `/api/files/<token>`: the token is `base64url(JSON{ key, exp, name, download })` + `.` + HMAC-SHA256, served by
  `LocalFilesController` with `nosniff`, `Content-Security-Policy: sandbox` and `Cache-Control: private, max-age=300`.
  The web needs no code change to follow a redirect: `<img>` and `<a>` follow it without CORS. **Download** gains
  `?download=1` (C1): a browser ignores `<a download>` once a redirect leaves the origin.
- **E3. The logo keeps its bytes route.** `GET /clinic/logo` stays a byte response from the API. `download.ts` draws
  the logo into a canvas for the PDF letterhead, and a cross-origin redirect would taint the canvas. The logo stays on
  multer (1 MB, B3's trap), and its `put` now writes the ledger (E5).
- **E4. The bytes must match the claimed type.** Checks run in this order. First the shared `uploadProblem(type,
  { type: claimed, size })`, with the mock's words and statuses: 413 for size, 400 otherwise. Then `sniff(head)`: an
  `image/*` claim must be JPEG, PNG or WebP by its bytes, and a PDF claim must start with `%PDF-`. Otherwise it is
  refused with the words `uploadProblem` uses for a wrong type (400). The stored and served `contentType` is the
  sniffed one. This is narrower than the mock's "any `image/*`", for the same reason as B4's patient photo
  (`CONVENTIONS` → Patients → Photos): nothing that can carry script is served. The web's `compressImage` sends JPEG
  anyway.
- **E5. A `StoredFile` ledger counts bytes (new pattern, flagged).** Columns: `clinicId`, `key` (unique), `area`,
  `bytes`, `createdAt`. `StorageService` is the only writer of files, so it is also the only writer of this table:
  every `put` inserts a row, and `delete` removes the file and then the row. `usedBytes()` is one `SUM` per clinic.
  The count covers logos, patient photos, clinical photos and seeded files with no per-feature code. A file whose
  transaction failed after `put` is still stored, so it is still counted, and the ledger is what a later orphan sweep
  reads. Why not `bytes` columns on `Patient`, `ClinicAccount` and `ClinicalPhoto`: that is three tables to keep in
  step, and it misses orphans.
- **E6. Consent is checked again under the patient's lock.** The first check runs in the mock's order, before the
  file is stored. The insert transaction takes `lockPatient`, reads the choices again and, if a "no" landed in
  between, writes no row. It queues `storage.delete` for the stored key in that same transaction and answers 409 with
  the mock's words. `changeChoices` already holds the same lock (B9 E7), so the two serialise.
- **E7. `ClinicalPhoto` and `PatientDocument` are in `APPEND_ONLY`** (decisions 5 and 6). There is no update or
  delete path. `StoredFile` is not append-only.
- **E8. Isolation, three layers.** (1) Every row read is tenant-scoped, so another clinic's photo id is 404
  "Photo not found". (2) `StorageService.link(key)` signs only the request's clinic's keys (`own(key)`); another
  clinic's key reads as missing, which is B1-c's rule extended to links. (3) A local token's HMAC covers the key and the
  expiry, so a token edited to another key, or one past `exp`, is 404. A link is a bearer link for its 5 minutes, as a
  presigned URL is. It is issued only after the access check.
- **E9. Documents.** `POST /patients/:id/documents` follows the mock's order exactly: 404 → 400 Zod issues → 400
  "Unknown staff member" → 400 "A dentist has to issue the …" → 400 "… for this patient" (source) → 409 allergy → 201.
  The body is parsed after the 404 (`@Body() body: unknown`, CONVENTIONS → Traps). The pure rule lives in
  `documents.rules.ts` and is given the facts: the issuer's roles, whether the source fits, and the child's
  allergies. The issuer is any `Staff` row, deactivated included, as the mock's `db.staff`. A source fits as follows.
  A visit must be this child's and `completed`. A payment must be this child's and `isMoneyIn`. A note must be this
  child's, signed, and from a template whose procedure has `NOTE_MESSAGES`. The title is
  `${DOCUMENT_TYPE_LABEL[type]} · ${firstName} ${lastName}`. `GET /documents` is clinic-wide, newest first, at most
  100, as the mock.
- **E10. Audit, as B4–B9.** Per-child reads write a `view` entry: "Photos" (list), "Photo" (open, inside
  `REPEAT_WINDOW_MS`) and "Documents". Writes are recorded in their transaction: `create` "Photo" and `export`
  "Document". The clinic-wide `GET /documents` is not audited: B4 and B7 audit no lists or whole-clinic screens.
- **E11. Driver selection.** With `S3_BUCKET` set, the driver is `S3FileStorage`, using `S3_REGION` (default
  `ap-southeast-1`), optional `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` for R2 or MinIO, and `ServerSideEncryption:
  AES256` on every put. Otherwise it is `LocalDiskStorage(STORAGE_DIR, signer)`. Credentials come from `S3_ACCESS_KEY_ID`
  and `S3_SECRET_ACCESS_KEY` (both or neither). With neither set, the SDK's default chain is used (an IAM role in
  production), which is the one place a library reads `process.env` itself (Question 3). `STORAGE_LINK_SECRET` (≥ 32
  characters) signs local links; when it is unset, a random secret per process is used. A restart then voids
  outstanding links, which is harmless because every open makes a new one.
- **E12. Parent uploads as the mock** (decision 7). A request is from a parent when its roles lack `clinical.write`.
  Parents may upload `intraoral`, `extraoral` and `document`, with no visit, stage or tooth, and the consent block
  applies. A parent lists only parent uploads. A parent opening a staff photo gets 404 "Photo not found". For parents,
  `/photos/:id/file` resolves its owner through `RecordOwners` (`photos.patientOf`).
- **E13. Abuse cap.** A `Content-Length` above twice the limit answers 413, with the type's "too large" words, before
  the body is read. This is the only place the mock's order isn't kept. A file just over the limit is still caught by
  the busboy limit and refused in order.
- **E14. Seed files are tiny real files.** `@pedia/seed` gains `seed-files.ts`: a 1×1 PNG and a one-page PDF as
  `Uint8Array`, browser-safe and without faker. `seedPhotos()` builds deterministic photos (`photo_seed_<n>`) and
  documents (`doc_seed_<n>`) from records that already exist. MSW serves a seeded file when IndexedDB has none. The
  API seed writes the files through the configured driver.

### Contract changes (shared, mock, API and web together)

| # | Change | Shared | Mock | API | Web |
| --- | --- | --- | --- | --- | --- |
| C1 | `GET /photos/:id/file?download=1` answers `Content-Disposition: attachment` | doc comment | `photos/mocks.ts` | `PhotosController` | `FileCard`'s Download link |
| C2 | A file read may answer `302` to a private link valid `FILE_LINK_SECONDS` (300) | `domain/photos.ts`, schema comments | unchanged (answers 200 bytes; both are valid for `<img>`/`<a>`) | photo file and patient photo | no change |
| C3 | The saved file name rule moves to shared: `photoFileName(patient, photo)` | `domain/photos.ts` | uses it | uses it | — |
| C4 | Upload contract unchanged: multipart `file` + `meta` JSON, any part order | — | — | spooled (E1) | — |

### Endpoint inventory

| Route | Rule (exists) | API order | Mock source |
| --- | --- | --- | --- |
| `GET /patients/:id/photos` | `clinical.view` or `uploads.create`, owner `id` | guard → list, newest `takenOn` then `createdAt`; without `clinical.view` only parent uploads; unknown child `[]` | `photos/mocks.ts:15–23` |
| `POST /patients/:id/photos` | `clinical.write` or `uploads.create`, owner `id` | 404 → (413 cap, E13) → 400 "Attach a file" → 400 "`meta` must be JSON" → 400 issues → 413/400 `uploadProblem` → 400 sniff → 409 declined → 400 "Upload a photo or a medical document" → 400 "Visit not found" → 201 (409 if a "no" raced, E6) | `photos/mocks.ts:26–73` |
| `GET /photos/:id/file[?download=1]` | `clinical.view` or `uploads.create`, owner `record` | 404 "Photo not found" (unknown, another clinic's, a parent on a staff photo) → 302 | `photos/mocks.ts:75–91` |
| `PUT /patients/:id/photo` | `patients.write` (B4) | 404 → (413 cap) → 400 "Attach an image file" → 413 "Images must be under 10 MB" → 400 sniff → 200 | `patients/mocks.ts:333–343` |
| `GET /patients/:id/photo` | `patients.view`, owner `id` (B4) | 404 "No photo" → 302 | `patients/mocks.ts:345–352` |
| `GET /files/:token` | **new, API-only public** (the signature is the authority), beside `GET /health` | 404 "This link has expired" (bad signature, expired, other shape) → 200 bytes | — (local driver only) |
| `GET /documents` | `documents.issue` | newest first, 100 | `documents/mocks.ts:42–45` |
| `GET /patients/:id/documents` | `documents.issue` | newest first | `documents/mocks.ts:36–39` |
| `POST /patients/:id/documents` | `documents.issue`, `exportRead` | E9's order | `documents/mocks.ts:47–76` |

## 2. Comprehensive Plan by Phases

## B10a: Contract and seed

### Phase 1: Shared rules, the mock and the web's Download link

#### Step 1.1: `FILE_LINK_SECONDS`, `photoFileName` and the 302 note in `@pedia/shared`

**File:** `packages/shared/src/domain/photos.ts`, `photos.test.ts`, `packages/shared/src/schemas/photo.ts`
**Verify:** `pnpm run check -- domain/photos`

Moves the mock's file-name rule into shared (C3), adds the link lifetime (C2), and documents that a file read may
redirect. The API's `PhotosController` and the mock both call `photoFileName`, so a saved file is named the same way
in every mode. The extension now follows the type (`.png` for a PNG). The mock always said `.jpg`, which made a seeded
PNG save under the wrong extension.

```diff
// packages/shared/src/domain/photos.ts
 export const PDF = "application/pdf";
 export const isPdf = (contentType: string) => contentType === PDF;
 
+/** How long a private link to a file stays valid, in seconds (B10 decision 3). The API answers a file read with a 302 to one. */
+export const FILE_LINK_SECONDS = 300;
+
+const EXTENSION: Record<string, string> = { "image/png": "png", "image/webp": "webp", [PDF]: "pdf" };
+
+/**
+ * The name a saved clinical file gets, never the record id: "mendoza-bea-intraoral-74-2026-10-02.jpg". The mock and the
+ * API both name files with it (Content-Disposition). Any other image type saves as `.jpg`, as the demo always did.
+ */
+export function photoFileName(
+  patient: { lastName: string; firstName: string },
+  photo: Pick<ClinicalPhoto, "type" | "tooth" | "takenOn" | "contentType">,
+): string {
+  const name = [patient.lastName, patient.firstName, photo.type, photo.tooth, photo.takenOn]
+    .filter(Boolean)
+    .join("-")
+    .replace(/[^\w.-]+/g, "-")
+    .toLowerCase();
+  return `${name}.${EXTENSION[photo.contentType] ?? "jpg"}`;
+}
+
 /** Upload rules as data. PDFs only where a paper document is expected (a clearance, a lab result, a referral). */
```

```diff
// packages/shared/src/schemas/photo.ts
-/** The file itself is served from `GET /photos/:id/file`. */
+/**
+ * The file itself is served from `GET /photos/:id/file`: the bytes (the demo), or a 302 to a private link valid
+ * FILE_LINK_SECONDS (apps/api, B10). `?download=1` asks for it as an attachment. Both work as an <img> src or a link.
+ */
 export const ClinicalPhoto = ClinicScoped.extend({
```

```diff
// packages/shared/src/domain/photos.test.ts (new describe at the end)
+describe("photoFileName", () => {
+  it("names a saved file by the child, the type, the tooth and the day, never the record id", () => {
+    const bea = { lastName: "Mendoza", firstName: "Bea" };
+    expect(photoFileName(bea, { type: "intraoral", tooth: 74, takenOn: "2026-10-02", contentType: "image/jpeg" })).toBe(
+      "mendoza-bea-intraoral-74-2026-10-02.jpg",
+    );
+    expect(photoFileName(bea, { type: "xray", takenOn: "2026-10-02", contentType: "image/png" })).toBe("mendoza-bea-xray-2026-10-02.png");
+    expect(photoFileName({ lastName: "dela Cruz", firstName: "Ana Mae" }, { type: "document", takenOn: "2026-10-02", contentType: "application/pdf" })).toBe(
+      "dela-cruz-ana-mae-document-2026-10-02.pdf",
+    );
+  });
+  it("gives a private link five minutes", () => expect(FILE_LINK_SECONDS).toBe(300));
+});
```

Add `photoFileName` and `FILE_LINK_SECONDS` to the test's import. `packages/shared/src/index.ts` already re-exports
`domain/photos` (the mock imports `isPdf` and `UPLOAD_RULES` from `@pedia/shared`); confirm that rather than adding a line.

#### Step 1.2: The mock serves `?download=1` as an attachment and uses the shared name

**File:** `apps/web/src/features/photos/mocks.ts`, `apps/web/src/mocks/handlers.test.ts`
**Verify:** `pnpm run check -- handlers.test`

C1 and C3 in the spec. Nothing else in the handler changes: the mock answers 200 with the bytes, which is still a
valid answer to the contract (C2).

```diff
// apps/web/src/features/photos/mocks.ts
-import { CONSENTED_PHOTO_TYPES, UPLOAD_RULES, UploadPhotoInput, choiceDeclined, isPdf, rolesCan, uploadProblem, type ClinicalPhoto, type PhotoType } from "@pedia/shared";
+import { CONSENTED_PHOTO_TYPES, UPLOAD_RULES, UploadPhotoInput, choiceDeclined, photoFileName, rolesCan, uploadProblem, type ClinicalPhoto, type PhotoType } from "@pedia/shared";
@@
   http.get(url("/photos/:id/file"), async ({ params, request }) => {
     const photo = db.photos.find((p) => p.id === params.id);
     if (photo && photo.uploadedBy !== "parent" && !inScope(sessionOf(request), "clinical.view", photo.patientId)) {
       return new HttpResponse("Photo not found", { status: 404 }); // a parent can't open clinical imaging
     }
     const blob = photo && (await getBlob(photo.id));
     if (!photo || !blob) return new HttpResponse("Photo not found", { status: 404 });
-    // A readable name if saved, never the record id: "mendoza-bea-intraoral-74-2026-10-02.jpg".
-    const patient = db.patients.find((p) => p.id === photo.patientId);
-    const name = [patient?.lastName, patient?.firstName, photo.type, photo.tooth, photo.takenOn]
-      .filter(Boolean)
-      .join("-")
-      .replace(/[^\w.-]+/g, "-")
-      .toLowerCase();
-    const ext = isPdf(photo.contentType) ? "pdf" : "jpg";
-    return new HttpResponse(blob, { headers: { "Content-Type": photo.contentType, "Content-Disposition": `inline; filename="${name}.${ext}"` } });
+    // A readable name if saved, never the record id (photoFileName, shared with the API).
+    const patient = db.patients.find((p) => p.id === photo.patientId) ?? { lastName: "", firstName: "" };
+    // ?download=1: saved rather than opened (FileCard's Download). The API's 5-minute link carries the same disposition.
+    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
+    return new HttpResponse(blob, {
+      headers: { "Content-Type": photo.contentType, "Content-Disposition": `${disposition}; filename="${photoFileName(patient, photo)}"` },
+    });
   }),
```

`handlers.test.ts`, `describe("photos")`, in "takes a PDF for a medical document…", after the existing
`content-disposition` assertion:

```diff
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/${doc.id}/file`);
-    expect(res.headers.get("content-disposition")).toMatch(/\.pdf"$/);
+    expect(res.headers.get("content-disposition")).toMatch(/^inline; filename=".+-document-2026-10-02\.pdf"$/);
+    const saved = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/${doc.id}/file?download=1`);
+    expect(saved.headers.get("content-disposition")).toMatch(/^attachment; filename=".+-document-2026-10-02\.pdf"$/);
     await expect(upload(patient.id, meta, pdf)).rejects.toMatchObject({ status: 400 });
```

#### Step 1.3: The web's Download link asks for an attachment

**File:** `apps/web/src/features/photos/api.ts`, `apps/web/src/features/photos/components/file-card.tsx`, `apps/web/src/features/photos/file-url.test.ts` (new)
**Verify:** `pnpm run check -- features/photos`

`photoFileUrl(id, { download: true })` adds `?download=1`, and `FileCard`'s Download uses it. Open (new tab) and every
`<img>` keep the plain URL. No layout, copy or colour change, so the `ui-ux-design` skill isn't needed. The test file
is new so that the check can fail: `typecheck` would pass before the step.

```diff
// apps/web/src/features/photos/api.ts
-/** Usable directly as an <img> src. */
-export const photoFileUrl = (photoId: string) => `${env.apiUrl}/photos/${photoId}/file`;
+/**
+ * Usable directly as an <img> src or a link. The API answers with a 302 to a 5-minute private link (B10), which <img> and
+ * <a> follow by themselves. `download`: saved rather than opened, because a browser ignores <a download> once a redirect
+ * leaves the page's origin.
+ */
+export const photoFileUrl = (photoId: string, { download = false } = {}) =>
+  `${env.apiUrl}/photos/${photoId}/file${download ? "?download=1" : ""}`;
```

```diff
// apps/web/src/features/photos/components/file-card.tsx
-        <a href={href} download className="text-brand underline-offset-2 hover:underline">Download</a>
+        <a href={photoFileUrl(photo.id, { download: true })} download className="text-brand underline-offset-2 hover:underline">Download</a>
```

```ts
// apps/web/src/features/photos/file-url.test.ts (new)
import { describe, expect, it } from "vitest";
import { photoFileUrl } from "./api";

describe("photoFileUrl", () => {
  it("opens by default and asks for an attachment for Download", () => {
    expect(photoFileUrl("p1")).toMatch(/\/photos\/p1\/file$/);
    expect(photoFileUrl("p1", { download: true })).toMatch(/\/photos\/p1\/file\?download=1$/);
  });
});
```

If importing `api.ts` (a `"use client"` module that imports TanStack Query) fails under the web's Vitest
environment, move `photoFileUrl` into `features/photos/file-url.ts`, re-export it from `api.ts`, and test that file
instead. The import graph decides this, not taste.

#### Phase 1 — Potential Issues

- **Type mismatches:** `photoFileName` takes `Pick<ClinicalPhoto, …>`, and the mock's `db.photos` rows are
  `ClinicalPhoto`, so it fits. The API passes a `toPhoto(row)` result (Step 6.1).
- **Breaking changes:** a saved PNG is now named `.png` rather than `.jpg`. No test pins the old extension for a PNG,
  and the demo's uploads are all JPEG (`compressImage`), so only seeded PNGs (Phase 2) see the difference.
- **Edge cases:** an unknown `download` value (`?download=yes`) is `inline`. Both the mock and the API compare with
  `"1"` exactly.
- **New patterns:** none. The query flag follows `?v=` on the patient photo (`patients/api.ts:72`).
- **Cross-cutting registration:** none. No new route; `?download=1` is a query on an existing route, and access
  matching ignores the query string (`rulePath`).

**Issues identified:** the mock named every image `.jpg` (fixed by C3).

### Phase 2: Seeded photos and documents (`@pedia/seed`, MSW)

#### Step 2.1: `seed-files.ts` and `seedPhotos()`

**File:** `packages/seed/src/seed-files.ts` (new), `packages/seed/src/seed-photos.ts` (new), `packages/seed/src/seed.ts`, `packages/seed/src/seed.test.ts`
**Verify:** `pnpm run check -- seed.test`

Deterministic photos (before/after on a tooth, an X-ray, a parent's PDF) and documents (a certificate, a receipt) for
Bulilit Smiles. The child who declined photos gets none. **No faker call** is added (root CONVENTIONS → Traps: a faker
call re-rolls every later record). Everything is derived from records `seed()` already built, after `seedRoster`.

```ts
// packages/seed/src/seed-files.ts (new)
/**
 * Tiny real files for the seeded photos (B10 E14): a 1×1 PNG and a one-page PDF. Real bytes, so the API's content
 * sniffing and the browser both accept them. Uint8Array and atob only: this package runs in the browser (MSW) too.
 */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_1_PAGE =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

export const SEED_FILES = {
  "image/png": Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0)),
  "application/pdf": new TextEncoder().encode(PDF_1_PAGE),
} as const;
export type SeedFileType = keyof typeof SEED_FILES;

/** A seeded photo's bytes, or undefined for anything not seeded (an upload). */
export const seedFileOf = (photo: { id: string; contentType: string }): Uint8Array | undefined =>
  photo.id.startsWith("photo_seed_") ? SEED_FILES[photo.contentType as SeedFileType] : undefined;
```

```ts
// packages/seed/src/seed-photos.ts (new)
import { DOCUMENT_TYPE_LABEL, isMoneyIn, type ClinicalPhoto, type Patient, type PatientDocument, type Payment, type Visit } from "@pedia/shared";

type Refs = { clinicId: string; patients: Patient[]; visits: Visit[]; payments: Payment[]; childId: string | undefined; dentistId: string; deskId: string };

/**
 * B10: the example child's photo record and two issued documents. The example plan's child (it has completed visits and
 * a paid bill), never a child who declined clinical photos. Ids `photo_seed_<n>` / `doc_seed_<n>` are the same in MSW
 * and the API's seed (hybrid). Files: seed-files.ts.
 */
export function seedPhotos({ clinicId, patients, visits, payments, childId, dentistId, deskId }: Refs): { photos: ClinicalPhoto[]; documents: PatientDocument[] } {
  const child = patients.find((p) => p.id === childId);
  const done = visits.filter((v) => v.patientId === childId && v.status === "completed").sort((a, b) => a.date.localeCompare(b.date));
  const [first, last] = [done[0], done.at(-1)];
  const paid = payments.find((p) => p.patientId === childId && p.amount > 0 && isMoneyIn(p));
  if (!child || !first || !last) return { photos: [], documents: [] };

  const at = (date: string, minutes: number) => new Date(`${date}T01:00:00.000Z`).getTime() + minutes * 60_000;
  const photo = (n: number, p: Omit<ClinicalPhoto, "id" | "clinicId" | "patientId" | "createdAt">, date: string): ClinicalPhoto => ({
    ...p, id: `photo_seed_${n}`, clinicId, patientId: child.id, createdAt: new Date(at(date, n)).toISOString(),
  });
  const photos = [
    photo(1, { visitId: first.id, type: "intraoral", stage: "before", tooth: 74, takenOn: first.date, caption: "Before: distal caries on 74", contentType: "image/png", uploadedBy: "staff" }, first.date),
    photo(2, { visitId: last.id, type: "intraoral", stage: "after", tooth: 74, takenOn: last.date, caption: "After: restored", contentType: "image/png", uploadedBy: "staff" }, last.date),
    photo(3, { visitId: first.id, type: "xray", takenOn: first.date, caption: "Bitewing, left", contentType: "image/png", uploadedBy: "staff" }, first.date),
    photo(4, { type: "document", takenOn: last.date, caption: "Paediatrician's clearance", contentType: "application/pdf", uploadedBy: "parent" }, last.date),
  ];
  const doc = (n: number, d: Pick<PatientDocument, "type" | "sourceId" | "issuedBy">, date: string): PatientDocument => ({
    ...d, id: `doc_seed_${n}`, clinicId, patientId: child.id,
    title: `${DOCUMENT_TYPE_LABEL[d.type]} · ${child.firstName} ${child.lastName}`, createdAt: new Date(at(date, 60 + n)).toISOString(),
  });
  const documents = [
    doc(1, { type: "dental_certificate", sourceId: last.id, issuedBy: dentistId }, last.date),
    ...(paid ? [doc(2, { type: "receipt", sourceId: paid.id, issuedBy: deskId }, paid.receivedAt.slice(0, 10))] : []),
  ];
  return { photos, documents };
}
```

```diff
// packages/seed/src/seed.ts (inside seed(), after `roster`; the patients passed are the consent-stamped ones)
+  const consented = withConsent(seedProfiles([...patients, ...family.patients, ...roster.patients]), STAFF.find((s) => s.id === "staff_cruz")!, { none: [5], noPhotos: [11] });
+  const files = seedPhotos({
+    clinicId: CLINIC_ID, patients: consented, visits: allVisits, payments: [...billing.payments, ...roster.payments],
+    childId: example.planItems[0]?.patientId, dentistId: "staff_reyes", deskId: "staff_cruz",
+  });
   return {
     branches: BRANCHES,
-    patients: withConsent(seedProfiles([...patients, ...family.patients, ...roster.patients]), STAFF.find((s) => s.id === "staff_cruz")!, { none: [5], noPhotos: [11] }),
+    patients: consented,
@@
-    photos: [],
+    photos: files.photos,
@@
-    documents: [],
+    documents: files.documents,
```

Export `SEED_FILES`, `seedFileOf` and `SeedFileType` from `packages/seed/src/index.ts`. `seedProfiles` and
`withConsent` are pure over their input, so hoisting the `patients:` expression into `consented` changes no value.
Check that by running the existing `seed.test.ts` first-patient assertions unchanged.

`seed.test.ts` (new `describe("photos and documents (B10)")`):
- Bulilit has 4 photos and 1–2 documents. Every id starts with `photo_seed_` / `doc_seed_`. Each photo's `visitId`, if
  set, is a completed visit of the same child. The receipt's `sourceId` is that child's payment, and it is `isMoneyIn`.
- The child is not one who declined photos: `!choiceDeclined(child, "photos")`.
- Every photo parses with `ClinicalPhoto` and every document with `PatientDocument`. `seedFileOf` returns bytes for
  each seeded photo: the PNG begins `89 50 4E 47` and the PDF begins `%PDF-`.
- The two other clinics (Ngiti, Ipin) still have none.
- `seed()` twice gives equal `photos` and `documents`, apart from `createdAt` on days that move with today. Compare
  with `createdAt` stripped, as the seed's other date-relative tests do.

#### Step 2.2: MSW serves seeded files; bump the mock db key

**File:** `apps/web/src/features/photos/mocks.ts`, `apps/web/src/mocks/db.ts`, `apps/web/src/mocks/handlers.test.ts`
**Verify:** `pnpm run check -- mocks/handlers`

The blob store (IndexedDB) holds only uploads. A seeded photo's bytes come from `@pedia/seed`, so "Reset demo data"
(which clears the blob store) never loses them.

```diff
// apps/web/src/features/photos/mocks.ts
+import { seedFileOf } from "@pedia/seed";
@@
-    const blob = photo && (await getBlob(photo.id));
+    const seeded = photo && seedFileOf(photo);
+    const blob = photo && ((await getBlob(photo.id)) ?? (seeded && new Blob([seeded], { type: photo.contentType })));
     if (!photo || !blob) return new HttpResponse("Photo not found", { status: 404 });
```

```diff
// apps/web/src/mocks/db.ts
-// v28: <previous reason>
-const KEY = "pedia-dental:mock-db:v28";
+// v29: B10 seeds photos and issued documents (photo_seed_*, doc_seed_*).
+const KEY = "pedia-dental:mock-db:v29";
```

Keep the existing comment lines above the key as they are and add the v29 line (root CONVENTIONS → Traps: each bump
gets a one-line reason). Update the root `CONVENTIONS.md` mention of `v28` in Step 9.3.

Check that `apps/web` already depends on `@pedia/seed`: the MSW `db` is seeded from it (CONVENTIONS → Where things
live), so the import resolves.

`handlers.test.ts`, `describe("photos")`, new case:

```ts
  it("serves the seeded photo record with real files, and shows a parent only parent uploads", async () => {
    const seeded = db.photos.filter((p) => p.id.startsWith("photo_seed_"));
    expect(seeded).toHaveLength(4);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/photo_seed_1/file`);
    expect([res.status, res.headers.get("content-type")]).toEqual([200, "image/png"]);
    expect(new Uint8Array(await res.arrayBuffer()).slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const listed = await api(`/patients/${seeded[0].patientId}/photos`, z.array(ClinicalPhoto));
    expect(listed.map((p) => p.id)).toEqual(expect.arrayContaining(seeded.map((p) => p.id)));
  });
```

Parent narrowing already has its own test in `describe("parent portal")`. Don't duplicate it here (the describe
order matters: root CONVENTIONS → Traps).

#### Phase 2 — Potential Issues

- **Seed determinism:** `seedPhotos` uses no faker and reads only records built before it, so no later record moves.
  `seed.test.ts`'s first-patient names must not change. If they do, the hoist touched faker order, and that is a bug
  in this step, not a test to update.
- **The example child:** `example.planItems[0]?.patientId` is undefined only if the example plan is empty. In that
  case `seedPhotos` returns empty lists and the seed test fails loudly (it expects 4).
- **Totals and guards:** documents and photos are counted by nothing in finance or Today. The `pay_seed_` guard in
  `describe("financial dashboard")` reads payments, which this phase doesn't change.
- **`handlers.test.ts` order:** the new case only reads, so it can't disturb the shared db for later describes.
- **The mock db key:** without the bump, a browser keeps v28's empty `photos` and the seeded record never shows.
- **New patterns:** a seed module of fixed bytes is new. It is needed because no seeded record had a file before;
  the alternative, generating images at seed time, would need a canvas in the browser and zlib in Node.

**Issues identified:** none.

## B10b: Storage

### Phase 3: Tables, streaming `put`, links and the ledger

#### Step 3.1: `StoredFile`, `ClinicalPhoto`, `PatientDocument`; migration; scopes

**File:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_b10_photos_documents/migration.sql`, `apps/api/src/prisma/model-scope.ts`
**Verify:** `pnpm run check -- tenant-scope`

Three clinic models. The two record models are append-only. No relations, as the neighbouring models (`ClinicalNote`,
`Message`): ids are checked by the services. `createdAt` is set by the app from `Clock`, as elsewhere.

```prisma
// apps/api/prisma/schema.prisma (after PlanItem)

/// B10: ClinicalPhoto.type in @pedia/shared. `document`: a medical document a parent photographed or scanned.
enum PhotoType {
  intraoral
  extraoral
  xray
  referral
  document
}

enum PhotoStage {
  before
  after
}

enum UploadedBy {
  staff
  parent
}

/// B10: a clinical photo or a parent's medical document (features/photos/mocks.ts). Append-only: photos are part of the
/// medical record and are never edited or deleted (decision 5). The bytes are in storage under `fileKey`.
model ClinicalPhoto {
  id          String      @id @default(cuid(2))
  clinicId    String
  patientId   String
  visitId     String?
  type        PhotoType
  stage       PhotoStage?
  tooth       Int?
  takenOn     DateTime    @db.Date
  /// Unbounded in the contract, so TEXT.
  caption     String      @db.Text
  /// The sniffed type (E4), never the browser's claim.
  contentType String      @db.VarChar(64)
  uploadedBy  UploadedBy
  /// clinics/<clinicId>/photos/<uuid>.<ext>, built by StorageService.
  fileKey     String      @db.VarChar(191)
  bytes       Int
  createdAt   DateTime

  /// GET /patients/:id/photos, newest takenOn then createdAt.
  @@index([clinicId, patientId, takenOn, createdAt])
}

/// B10: DocumentType in @pedia/shared (feature 13).
enum DocumentType {
  dental_certificate
  treatment_plan
  consent_form
  referral_letter
  clearance
  dental_clearance
  post_op_instructions
  prescription
  receipt
  patient_summary
  notes_report
  privacy_consent
}

/// B10: one issued document (features/documents/mocks.ts). Append-only; the PDF is built in the browser and never
/// stored (decision 6). `details` and `items` are stored as given after GenerateDocumentInput parsed them.
model PatientDocument {
  id        String       @id @default(cuid(2))
  clinicId  String
  patientId String
  type      DocumentType
  title     String       @db.Text
  /// The visit, payment or signed note it came from, checked when one is required; otherwise kept as given (as the mock).
  sourceId  String?      @db.VarChar(191)
  details   Json?
  items     Json?
  issuedBy  String       @db.VarChar(191)
  createdAt DateTime

  /// GET /documents (clinic-wide, newest first) and GET /patients/:id/documents.
  @@index([clinicId, createdAt])
  @@index([clinicId, patientId, createdAt])
}

/// B10 (E5): every file a clinic keeps, written and removed only by StorageService. SUM(bytes) is the clinic's storage.
model StoredFile {
  id        String   @id @default(cuid(2))
  clinicId  String
  key       String   @unique @db.VarChar(191)
  /// A StorageArea: branding, patients, photos.
  area      String   @db.VarChar(32)
  bytes     Int
  createdAt DateTime

  @@index([clinicId])
}
```

```diff
// apps/api/src/prisma/model-scope.ts
   // B9: parent messages.
   Message: "clinic",
+  // B10: clinical photos, the issued-documents log, and the ledger of stored files (E5).
+  ClinicalPhoto: "clinic",
+  PatientDocument: "clinic",
+  StoredFile: "clinic",
@@
   // B8: payments. A refund or a returned credit is a new row.
   "Payment",
+  // B10: photos are part of the medical record (decision 5); an issued document is a fact (decision 6).
+  "ClinicalPhoto", "PatientDocument",
 ]);
```

(Place the `MODEL_SCOPE` lines where the B9 `Message` entry is; the diff's anchor is indicative.) Then:
`pnpm --filter api db:migrate --name b10_photos_documents` and `pnpm --filter api db:generate` (CONVENTIONS → Traps:
Prisma 7's `migrate dev` doesn't regenerate). New tables only, so `migrate dev` won't warn. Commit the migration.

`src/prisma/tenant-scope.test.ts`, new case (it makes the check able to fail):

```ts
  it("keeps B10's photos and documents append-only and its ledger deletable", () => {
    for (const model of ["ClinicalPhoto", "PatientDocument"] as const) {
      expect(() => scopeArgs(model, "update", { where: { id: "x" }, data: {} }, clinic)).toThrow(/append-only/);
      expect(() => scopeArgs(model, "deleteMany", { where: {} }, clinic)).toThrow(/append-only/);
    }
    expect(scopeArgs("StoredFile", "deleteMany", { where: { key: "k" } }, clinic).where).toMatchObject({ clinicId: "c1" });
  });
```

`clinic` is the test file's existing context fixture. Use its real name and clinic id; the shape above follows
`scopeArgs(model, operation, args, ctx)` (`tenant-scope.ts:29`).

#### Step 3.2: `FileStorage` takes streams and makes links; local signed links

**File:** `apps/api/src/storage/storage.ts`, `apps/api/src/storage/local-disk.storage.ts`, `apps/api/src/storage/local-links.ts` (new), `apps/api/src/storage/local-links.test.ts` (new)
**Verify:** `pnpm run check -- local-links`

`put(key, body: Buffer | Readable, { contentType, bytes })`, `link(key, LinkOptions)`; HMAC sign/verify as pure
functions. `get` stays for the logo's byte route (E3).

```diff
// apps/api/src/storage/storage.ts
-/** Where a clinic's files are grouped. B4: a child's own photo. B10 adds "photos" and "documents"; B12's sign-up files need a platform area. */
-export const STORAGE_AREAS = ["branding", "patients"] as const;
+/** Where a clinic's files are grouped. B4: a child's own photo; B10: clinical photos (documents store no file, decision 6). B12's sign-up files need a platform area. */
+export const STORAGE_AREAS = ["branding", "patients", "photos"] as const;
@@
+/** What a driver needs to store a file: S3 wants the length up front, and the type is served back. */
+export type PutInfo = { contentType: string; bytes: number };
+/** A private link's terms (E2). `fileName` is already safe for a header (photoFileName / photoFileName-style). */
+export type LinkOptions = { contentType: string; fileName: string; download: boolean; expiresInSeconds: number };
+
 /**
  * Where bytes live (CONVENTIONS → Side effects: files go to object storage). Drivers know nothing of clinics:
- * StorageService builds and checks every key. LocalDiskStorage now; B10's S3/R2 driver adds presigned URLs to this class.
+ * StorageService builds and checks every key. LocalDiskStorage (development, tests, one-server demos) and S3FileStorage (B10).
  */
 export abstract class FileStorage {
-  abstract put(key: string, body: Buffer): Promise<void>;
-  /** Undefined when there is no such file. */
+  /** A Buffer for small files from memory (the logo); a Readable for a checked upload's temp file (E1). */
+  abstract put(key: string, body: Buffer | Readable, info: PutInfo): Promise<void>;
+  /** Undefined when there is no such file. Only for the logo, which the API serves itself (E3); everything else is a link. */
   abstract get(key: string): Promise<Buffer | undefined>;
+  /** A private URL that serves the file for `expiresInSeconds`. Doesn't check that the file exists. */
+  abstract link(key: string, options: LinkOptions): Promise<string>;
   /** Succeeds when there is no such file. */
   abstract delete(key: string): Promise<void>;
 }
```

Add `import type { Readable } from "node:stream";` at the top.

```ts
// apps/api/src/storage/local-links.ts (new)
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** What a local-disk link carries (E2). Signed, not encrypted: it names a key, never patient data. */
const Claims = z.object({
  key: z.string().max(300),
  exp: z.number().int(),
  name: z.string().max(255),
  download: z.boolean(),
});
export type LinkClaims = z.infer<typeof Claims>;

const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

/** `<base64url claims>.<base64url HMAC-SHA256>`: URL-safe, one path segment. */
export function signLink(secret: string, claims: LinkClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** The claims of a live, untampered link; undefined for anything else (another secret, an edit, past `exp`, junk). */
export function verifyLink(secret: string, token: string, nowMs: number): LinkClaims | undefined {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length) return undefined;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  const claims = Claims.safeParse(parsed);
  return claims.success && claims.data.exp > nowMs ? claims.data : undefined;
}
```

```diff
// apps/api/src/storage/local-disk.storage.ts
-import { randomUUID } from "node:crypto";
-import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
+import { randomUUID } from "node:crypto";
+import { createReadStream, createWriteStream } from "node:fs";
+import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
 import { dirname, resolve, sep } from "node:path";
-import { FileStorage } from "./storage";
+import type { Readable } from "node:stream";
+import { pipeline } from "node:stream/promises";
+import { signLink, verifyLink } from "./local-links";
+import { CONTENT_TYPES, FileStorage, type LinkOptions, type PutInfo, parseKey } from "./storage";
+
+/** What GET /files/:token streams back (LocalFilesController). */
+export type OpenedFile = { stream: Readable; bytes: number; contentType: string; name: string; download: boolean };
 
 /**
  * Files on this instance's disk under STORAGE_DIR: development, tests, a one-server demo. Not shared between instances;
- * B10's S3/R2 driver is.
+ * S3FileStorage is. Links are `/api/files/<token>`, signed with `secret` (E2), served by LocalFilesController.
  */
 export class LocalDiskStorage extends FileStorage {
   private readonly root: string;
 
-  constructor(root: string) {
+  constructor(
+    root: string,
+    private readonly secret: string,
+    private readonly nowMs: () => number = Date.now,
+  ) {
     super();
     this.root = resolve(root);
   }
@@
   /** Written beside its target and renamed into place, so a reader never sees half a file. */
-  async put(key: string, body: Buffer): Promise<void> {
+  async put(key: string, body: Buffer | Readable, _info: PutInfo): Promise<void> {
     const path = this.pathOf(key);
     await mkdir(dirname(path), { recursive: true });
     const partial = `${path}.${randomUUID()}.partial`;
-    await writeFile(partial, body);
-    await rename(partial, path);
+    try {
+      if (Buffer.isBuffer(body)) await writeFile(partial, body);
+      else await pipeline(body, createWriteStream(partial));
+      await rename(partial, path);
+    } catch (error) {
+      await rm(partial, { force: true });
+      throw error;
+    }
   }
@@
+  async link(key: string, { fileName, download, expiresInSeconds }: LinkOptions): Promise<string> {
+    this.pathOf(key); // the same guard as every other method
+    return `/api/files/${signLink(this.secret, { key, exp: this.nowMs() + expiresInSeconds * 1000, name: fileName, download })}`;
+  }
+
+  /** A live link's file, or undefined (bad or expired token, unknown key shape, no such file). */
+  async open(token: string): Promise<OpenedFile | undefined> {
+    const claims = verifyLink(this.secret, token, this.nowMs());
+    const parts = claims && parseKey(claims.key);
+    if (!claims || !parts) return undefined;
+    const path = this.pathOf(claims.key);
+    const size = await stat(path).then((s) => s.size, () => undefined);
+    if (size === undefined) return undefined;
+    return { stream: createReadStream(path), bytes: size, contentType: CONTENT_TYPES[parts.ext], name: claims.name, download: claims.download };
+  }
```

The link is relative (`/api/files/…`). A browser resolves it against the origin that answered the 302: the web's
origin in `hybrid` (Next's `/api` proxy, `next.config.ts:11–13`), or the API's own origin when it is called directly.

`local-links.test.ts`: a link verifies before `exp` and not at or after it; another secret, one changed character in
the body or signature, a third segment, junk base64 and a body that fails `Claims` are all undefined; a token edited
to name another clinic's key (re-encoded body, old signature) is undefined (E8 layer 3).

#### Step 3.3: `StorageService`: `putFile`, `link`, the ledger, `usedBytes`

**File:** `apps/api/src/storage/storage.service.ts`, `apps/api/src/storage/storage.module.ts`, `apps/api/src/storage/storage.test.ts`
**Verify:** `pnpm run check -- storage.test`

Every put writes a `StoredFile` row; delete removes it; links only for the request's clinic.

```diff
// apps/api/src/storage/storage.service.ts
 import { randomUUID } from "node:crypto";
+import { createReadStream } from "node:fs";
+import type { Readable } from "node:stream";
 import { Injectable } from "@nestjs/common";
+import { FILE_LINK_SECONDS } from "@pedia/shared";
+import { Clock } from "../common/clock";
 import { requireContext } from "../common/request-context";
-import { TenantScopeError } from "../prisma/tenant-scope";
+import { PrismaService } from "../prisma/prisma.service";
+import { TenantScopeError, clinicData } from "../prisma/tenant-scope";
 import { CONTENT_TYPES, clinicKey, type FileExtension, FileStorage, parseKey, type StorageArea } from "./storage";
 
 export type StoredFile = { body: Buffer; contentType: string };
+/** A checked upload waiting on this instance's disk (readUpload, E1). */
+export type CheckedFile = { path: string; bytes: number };
 
 /**
  * A clinic's files. Every key is built here from the request's clinic and every read checks it, so another clinic's
- * key reads as missing: no difference from "absent" (B10's "can't read another's file even with its key"). B3 calls
- * `put` with an already-sanitised logo and keeps the key on the clinic's row.
+ * key reads as missing, and gets no link: no difference from "absent" (B10 decision 3). The only writer of files and
+ * of the StoredFile ledger (E5), so the ledger is exact whoever stores what.
  */
 @Injectable()
 export class StorageService {
-  constructor(private readonly files: FileStorage) {}
+  constructor(
+    private readonly files: FileStorage,
+    private readonly prisma: PrismaService,
+    private readonly clock: Clock,
+  ) {}
 
-  /** A new file of this clinic. Returns its key. */
+  /** A new file of this clinic from memory (the logo, B3). Returns its key. */
   async put(area: StorageArea, ext: FileExtension, body: Buffer): Promise<string> {
-    const key = clinicKey(this.clinicId(), area, randomUUID(), ext);
-    await this.files.put(key, body);
-    return key;
+    return this.store(area, ext, body, body.length);
   }
 
+  /** A new file of this clinic from a checked upload's temp file: streamed to the driver, never read whole (E1). */
+  async putFile(area: StorageArea, ext: FileExtension, file: CheckedFile): Promise<string> {
+    return this.store(area, ext, createReadStream(file.path), file.bytes);
+  }
+
+  /** A private link to one of this clinic's files, valid FILE_LINK_SECONDS; undefined for any other key (E8). */
+  async link(key: string, { fileName, download = false }: { fileName: string; download?: boolean }): Promise<string | undefined> {
+    const parts = this.own(key);
+    if (!parts) return undefined;
+    return this.files.link(key, { contentType: CONTENT_TYPES[parts.ext], fileName, download, expiresInSeconds: FILE_LINK_SECONDS });
+  }
+
   async get(key: string): Promise<StoredFile | undefined> {
@@
   async delete(key: string): Promise<void> {
-    if (this.own(key)) await this.files.delete(key);
+    if (!this.own(key)) return;
+    await this.files.delete(key);
+    await this.prisma.storedFile.deleteMany({ where: { key } }); // after the file: a crash between leaves an overcount the retry clears
   }
 
+  /** This clinic's stored bytes (decision 8): counted, never limited in B10. */
+  async usedBytes(): Promise<number> {
+    const { _sum } = await this.prisma.storedFile.aggregate({ _sum: { bytes: true } });
+    return _sum.bytes ?? 0;
+  }
+
+  private async store(area: StorageArea, ext: FileExtension, body: Buffer | Readable, bytes: number): Promise<string> {
+    const key = clinicKey(this.clinicId(), area, randomUUID(), ext);
+    await this.files.put(key, body, { contentType: CONTENT_TYPES[ext], bytes });
+    await this.prisma.storedFile.create({ data: { ...clinicData(), key, area, bytes, createdAt: this.clock.now() }, select: { id: true } });
+    return key;
+  }
+
   private own(key: string) {
```

`storage.module.ts` keeps `LocalDiskStorage` for now, with its new arguments. Step 4.3 replaces the factory:

```diff
-  providers: [{ provide: FileStorage, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.STORAGE_DIR) }, StorageService, DeleteFileHandler],
+  providers: [
+    { provide: FileStorage, inject: [ENV, Clock], useFactory: (env: Env, clock: Clock) => new LocalDiskStorage(env.STORAGE_DIR, randomBytes(32).toString("hex"), () => clock.now().getTime()) },
+    StorageService,
+    DeleteFileHandler,
+  ],
```

`storage.test.ts`: the module now needs `PrismaService` and `Clock`. Provide fakes in the test's `@Global()` module (it
already overrides `OutboxModule`, CONVENTIONS → Traps). The fake `storedFile` records `create`/`deleteMany`/`aggregate`
calls in memory. New cases:
- `put` writes a ledger row with the clinic, area and byte length; `delete` removes the file and then the row.
- `putFile` streams a temp file (write 3 MB to `root/tmp`, then compare bytes) and records `bytes` as given.
- `link` returns `/api/files/…` for an own key, and the token opens the bytes through `LocalDiskStorage.open`.
  `link` returns `undefined` for another clinic's key, so no link is ever minted for it.
- `usedBytes` sums the ledger.

The ledger's tenant scoping and the per-clinic sum are proven on MySQL in Step 6.3.

#### Step 3.4: `GET /files/:token` (local driver) as an API-only public route

**File:** `apps/api/src/storage/local-files.controller.ts` (new), `apps/api/src/auth/access-rules.ts`, `apps/api/src/auth/access-rules.test.ts`, `apps/api/test/clinical-routes.test.ts`
**Verify:** `pnpm run check -- access-rules`

Served with sandbox CSP and nosniff; 404 on a bad or expired token; excluded from the mock drift check like `/health`.

```ts
// apps/api/src/storage/local-files.controller.ts (new)
import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { LocalDiskStorage } from "./local-disk.storage";
import { FileStorage } from "./storage";

export const LINK_GONE = "This link has expired. Open the file again from the app.";

/**
 * GET /files/:token: the local-disk driver's private links (E2). Public (PUBLIC_RULES): the HMAC is the authority, and the
 * access check ran when the link was made. With the S3 driver every token is 404: S3 serves its own links.
 */
@Controller()
export class LocalFilesController {
  constructor(private readonly files: FileStorage) {}

  @Get("files/:token")
  async open(@Param("token") token: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = this.files instanceof LocalDiskStorage ? await this.files.open(token) : undefined;
    if (!file) throw new NotFoundException(LINK_GONE);
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes),
      "Content-Disposition": `${file.download ? "attachment" : "inline"}; filename="${file.name}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox", // as the logo: a PDF or image opened on its own can't run anything here
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(file.stream);
  }
}
```

Register it in `StorageModule` (`controllers: [LocalFilesController]`). That module has never had a controller.
`AppModule` reaches it through `ClinicModule` and `PatientsModule`; make it explicit by adding `StorageModule` to
`AppModule.forRoot`'s imports beside `OutboxModule`.

```diff
// apps/api/src/auth/access-rules.ts
-/** PUBLIC_RULES in the mock (no session of any kind), plus the API's own health check. */
+/** PUBLIC_RULES in the mock (no session of any kind), plus the API's own: the health check and B10's local file links. */
 export const PUBLIC_RULES: readonly Route[] = [
@@
   { method: "GET", path: "/health" },
+  { method: "GET", path: "/files/:token" },
 ];
```

```diff
// apps/api/src/auth/access-rules.test.ts
-  it("has every operator and public route, and no other (plus GET /health)", () => {
+  it("has every operator and public route, and no other (plus the API's own GET /health and GET /files/:token)", () => {
@@
-    expect(sorted(PUBLIC_RULES.filter((r) => r.path !== "/health"))).toEqual(sorted(webRules("PUBLIC_RULES")));
+    const apiOnly = new Set(["/health", "/files/:token"]);
+    expect(sorted(PUBLIC_RULES.filter((r) => !apiOnly.has(r.path)))).toEqual(sorted(webRules("PUBLIC_RULES")));
@@
     expect(matchRoute("GET", "/health")).toMatchObject({ kind: "public" });
+    expect(matchRoute("GET", "/files/abc.def")).toMatchObject({ kind: "public" });
+    expect(matchRoute("POST", "/files/abc.def")).toBeUndefined();
```

`test/clinical-routes.test.ts`, new case: `GET /api/files/junk` answers `404` with `LINK_GONE`. It reaches the
controller: not 401 or 403, and not Nest's own 404 body.

#### Phase 3 — Potential Issues

- **Type mismatches:** `PhotoType`, `PhotoStage`, `UploadedBy` and `DocumentType` are Prisma enums with the shared
  enums' values. Step 6.1 and Step 7.1 map rows through the shared schemas, so a drift fails parsing in a test.
- **Breaking changes to consumers:** `FileStorage.put` gains an argument and `LocalDiskStorage` gains a constructor
  argument. `ClinicService.uploadLogo` calls `StorageService.put` (unchanged signature). Search for `new
  LocalDiskStorage(` and `.put(` on `FileStorage`: `storage.test.ts` and the module are the only constructors.
  `StorageService` gains `PrismaService` and `Clock`. Both are global in the app (`PrismaModule`, `AppModule`'s
  `Clock`), but **every unit test that builds `StorageModule` must provide them** (`storage.test.ts`; check
  `logo.test.ts` and the clinic HTTP tests, which override `PrismaService` already).
- **Cross-cutting registration:** the 3 models in `MODEL_SCOPE`, 2 in `APPEND_ONLY`, the controller in
  `StorageModule`, and the public rule. The test app (`test/support/test-app.ts`) builds `AppModule`, so the new
  controller is in it.
- **Logging a link:** `loggerParams` logs the request path, and a `/files/<token>` path carries a key (a clinic id and
  a random UUID, no patient data) that works for 5 minutes. That is acceptable under the redaction rules (no patient
  data). Truncating `/files/*` paths in `loggerParams` would hide it, at the cost of a one-line special case. Noted in
  Issues; not done here.
- **The ledger's write is outside any transaction** by design (slow work first, CONVENTIONS → Traps). A `put` whose
  feature transaction then fails leaves a file and its ledger row. That is counted, which is true, and it is findable
  by a later sweep.
- **New patterns:** a public route outside the mock (precedent: `/health`); the ledger (E5).

**Issues identified:** request logs carry `/files/<token>` paths (Low).

### Phase 4: The S3 driver and its configuration

#### Step 4.1: Dependencies and env

**File:** `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/.env.example`
**Verify:** `pnpm run check -- config/env`

`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `busboy`; `S3_*` and `STORAGE_LINK_SECRET`.

`pnpm --filter api add @aws-sdk/client-s3@^3 @aws-sdk/s3-request-presigner@^3 busboy@^1.6.0` and
`pnpm --filter api add -D @types/busboy`. `busboy@1.6.0` is already in the lockfile (multer's dependency), so it is a
direct dependency now, not a new package.

```diff
// apps/api/src/config/env.ts (inside the Env object, after STORAGE_DIR)
   STORAGE_DIR: z.string().min(1).default("var/storage"),
+  // B10 (E11): the S3-compatible driver. Unset S3_BUCKET: the local-disk driver under STORAGE_DIR.
+  S3_BUCKET: z.string().min(3).optional(),
+  S3_REGION: z.string().min(1).default("ap-southeast-1"),
+  /** R2 or MinIO; unset for Amazon S3. */
+  S3_ENDPOINT: z.url().optional(),
+  S3_FORCE_PATH_STYLE: flag().default(false),
+  /** Both or neither; neither = the SDK's default chain (an IAM role in production). Checked by fileStorageOf. */
+  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
+  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
+  /** Signs the local driver's links. Unset: a random secret per process (links die with it; each open makes a new one). */
+  STORAGE_LINK_SECRET: z.string().min(32, "STORAGE_LINK_SECRET must be at least 32 characters").optional(),
```

Check how the existing boolean flags take their default (`BACKGROUND_WORK`, `COOKIE_SECURE`) and write
`S3_FORCE_PATH_STYLE` the same way. The "both or neither" rule is checked in `fileStorageOf` (Step 4.3), not with a
refinement on `Env`: test helpers build partial envs from the object's shape.

```diff
// apps/api/.env.example (after STORAGE_DIR)
 STORAGE_DIR=var/storage
+# B10: Amazon S3 (production: ap-southeast-1) or an S3-compatible store. Unset S3_BUCKET = the local-disk driver above.
+# S3_BUCKET=
+# S3_REGION=ap-southeast-1
+# R2 or MinIO only: their endpoint, and path-style addressing for MinIO.
+# S3_ENDPOINT=http://localhost:9000
+# S3_FORCE_PATH_STYLE=true
+# Both or neither. Neither: the SDK's default credentials (an IAM role in production).
+# S3_ACCESS_KEY_ID=
+# S3_SECRET_ACCESS_KEY=
+# Signs the local driver's 5-minute file links (32+ characters). Unset: a new random secret each start.
+# STORAGE_LINK_SECRET=
```

`env.test.ts`: the defaults (`S3_REGION` is `ap-southeast-1`, `S3_BUCKET` unset, `S3_FORCE_PATH_STYLE` false); a
31-character `STORAGE_LINK_SECRET` is refused with its message; `S3_ENDPOINT=not a url` is refused.

#### Step 4.2: `S3FileStorage`

**File:** `apps/api/src/storage/s3.storage.ts` (new), `apps/api/src/storage/s3.storage.test.ts` (new)
**Verify:** `pnpm run check -- s3.storage`

PutObject with length and SSE, GetObject, DeleteObject, presigned GET with the file's type and name; unit-tested with
a fake client and a real presigner.

```ts
// apps/api/src/storage/s3.storage.ts (new)
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { FileStorage, type LinkOptions, type PutInfo } from "./storage";

/**
 * Amazon S3 or an S3-compatible store (E11), shared by every instance: what makes photos survive a restart and a second
 * server. The bucket stays private (no public ACL, block public access on); files are read only through presigned GETs
 * of FILE_LINK_SECONDS (E2). `encrypt`: SSE-S3 on Amazon S3; off for R2/MinIO, which encrypt at rest themselves and may
 * refuse the header.
 */
export class S3FileStorage extends FileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly options: { encrypt: boolean },
  ) {
    super();
  }

  async put(key: string, body: Buffer | Readable, { contentType, bytes }: PutInfo): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: bytes,
        ...(this.options.encrypt && { ServerSideEncryption: "AES256" as const }),
      }),
    );
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Body ? Buffer.from(await Body.transformToByteArray()) : undefined;
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return undefined;
      throw error;
    }
  }

  link(key: string, { contentType, fileName, download, expiresInSeconds }: LinkOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** S3 answers 204 for a missing key too: idempotent, as the outbox needs (delete-file.handler.ts). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
```

`s3.storage.test.ts`:
- **put/get/delete** against a fake `{ send }` that records each command's `input` (cast to `S3Client`). `put`
  sends `Bucket`, `Key`, `ContentType`, `ContentLength` and `ServerSideEncryption: "AES256"`, and no SSE with
  `encrypt: false`. `get` maps a `NoSuchKey`-named error to `undefined` and rethrows others. `delete` sends the key.
- **link** with a real `new S3Client({ region: "ap-southeast-1", credentials: { accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret" } })`, so presigning runs locally with no network. The URL's host is
  `<bucket>.s3.ap-southeast-1.amazonaws.com` and its path is the key. `X-Amz-Expires=300`.
  `response-content-disposition` decodes to `inline; filename="…"`, or `attachment; …` with `download`, and
  `response-content-type` is the given type. With `endpoint: "http://localhost:9000"` and `forcePathStyle: true`, the
  URL is `http://localhost:9000/<bucket>/<key>?…`.

#### Step 4.3: The module picks the driver

**File:** `apps/api/src/storage/storage.module.ts`, `apps/api/src/storage/file-storage.ts` (new), `apps/api/src/storage/file-storage.test.ts` (new)
**Verify:** `pnpm run check -- file-storage`

`fileStorageOf(env)`: S3 when `S3_BUCKET` is set, local disk otherwise. The seed (Step 8.1) uses the same factory, so
`db:seed` writes seeded files where the API will read them.

```ts
// apps/api/src/storage/file-storage.ts (new)
import { randomBytes } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../config/env";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3FileStorage } from "./s3.storage";
import type { FileStorage } from "./storage";

type StorageEnv = Pick<
  Env,
  "STORAGE_DIR" | "STORAGE_LINK_SECRET" | "S3_BUCKET" | "S3_REGION" | "S3_ENDPOINT" | "S3_FORCE_PATH_STYLE" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY"
>;

/** The driver for this environment (E11): S3 when S3_BUCKET is set, this instance's disk otherwise. */
export function fileStorageOf(env: StorageEnv, nowMs: () => number = Date.now): FileStorage {
  if (!env.S3_BUCKET) return new LocalDiskStorage(env.STORAGE_DIR, env.STORAGE_LINK_SECRET ?? randomBytes(32).toString("hex"), nowMs);
  if (!env.S3_ACCESS_KEY_ID !== !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the SDK's default credentials.");
  }
  const client = new S3Client({
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
    ...(env.S3_ACCESS_KEY_ID && { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY! } }),
  });
  return new S3FileStorage(client, env.S3_BUCKET, { encrypt: !env.S3_ENDPOINT });
}
```

```diff
// apps/api/src/storage/storage.module.ts
 /**
- * Imported by the features that keep files (B3's ClinicModule first). B10 picks the driver from the environment.
+ * Imported by the features that keep files (B3's ClinicModule, B4's PatientsModule, B10's PhotosModule). The driver comes
+ * from the environment (fileStorageOf). Serves the local driver's links (LocalFilesController, E2).
  * Registers `storage.delete`, the outbox kind that removes a file once nothing points at it.
  */
 @Module({
   imports: [OutboxModule],
+  controllers: [LocalFilesController],
   providers: [
-    { provide: FileStorage, inject: [ENV, Clock], useFactory: (env: Env, clock: Clock) => new LocalDiskStorage(env.STORAGE_DIR, randomBytes(32).toString("hex"), () => clock.now().getTime()) },
+    { provide: FileStorage, inject: [ENV, Clock], useFactory: (env: Env, clock: Clock) => fileStorageOf(env, () => clock.now().getTime()) },
     StorageService,
     DeleteFileHandler,
   ],
   exports: [StorageService],
 })
```

`file-storage.test.ts`: unset `S3_BUCKET` gives a `LocalDiskStorage`. A bucket gives an `S3FileStorage`. A bucket
with only `S3_ACCESS_KEY_ID` throws the "both or neither" message. Two calls without `STORAGE_LINK_SECRET` make links
that don't verify across instances; with the secret, they do (sign with one, `open` with the other, after writing the
file).

#### Phase 4 — Potential Issues

- **A stream body can't be retried by the SDK.** `PutObject` with a file `ReadStream` fails rather than retrying if
  the connection drops mid-upload. The user sees a 500 and uploads again, and the temp file is gone by then. Passing a
  fresh stream per attempt needs a custom retry. Recorded in Issues; a 10 MB maximum makes it rare.
- **Credentials outside `env.ts`:** with no keys set, the SDK reads `AWS_*` variables, the shared config file, or
  instance metadata itself. That is the one exception to "env.ts is the only reader of `process.env`" (Question 3).
- **Bucket policy and CORS:** the bucket must block public access. **No CORS rule is needed**: the browser reaches S3
  only through `<img>` and `<a>` (E2), never `fetch`. If a later feature fetches a photo or draws it into a canvas, the
  bucket needs CORS for the web's origin. Recorded in Step 9.3's trap.
- **R2/MinIO and SSE:** `encrypt` is off whenever `S3_ENDPOINT` is set. An AWS endpoint override (a VPC endpoint)
  would also lose SSE-S3. Use the bucket's default encryption in production as well (Step 9.3, go-live notes).
- **Presigned URLs and clock skew:** S3 rejects a presigned URL whose signing time is too far from its own clock. The
  API's host clock must be NTP-synced (B13 deployment).
- **Breaking changes:** none outside storage; `fileStorageOf` replaces only the module's factory.
- **New patterns:** a cloud SDK dependency is new to the API. It is required by decision 1. `busboy` was already
  installed under multer.

**Issues identified:** S3 stream uploads aren't retried by the SDK (Low).

## B10c: Streaming uploads

### Phase 5: `readUpload`, sniffing, and the patient photo off multer

#### Step 5.1: `readUpload` and `sniff`

**File:** `apps/api/src/storage/multipart.ts` (new), `apps/api/src/storage/multipart.test.ts` (new), `apps/api/src/storage/sniff.ts` (new)
**Verify:** `pnpm run check -- storage/multipart`

busboy → temp file, bytes counted, first 16 bytes kept, `tooLarge`, fields capped, cleanup.

```ts
// apps/api/src/storage/sniff.ts (new; the signatures move here from patients/patient-photo.ts)
import type { FileExtension } from "./storage";

const SIGNATURES: [FileExtension, (b: Buffer) => boolean][] = [
  ["jpg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["pdf", (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"],
];

/** The images the API stores from uploads (E4): what the web's downscaler produces. No SVG, no GIF. */
export const IMAGE_EXTENSIONS: readonly FileExtension[] = ["jpg", "png", "webp"];

/** What a file's first bytes (16 are enough) say it is, among the types uploads may be; undefined for anything else. */
export const sniff = (head: Buffer): FileExtension | undefined => SIGNATURES.find(([, is]) => is(head))?.[0];
```

```ts
// apps/api/src/storage/multipart.ts (new)
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestException } from "@nestjs/common";
import busboy from "busboy";

const DIR = join(tmpdir(), "primolar-uploads");
/** `meta` is a few hundred bytes; anything past this is cut and then refused as not JSON. */
const FIELD_BYTES = 64 * 1024;
const HEAD_BYTES = 16;

/** The one `file` part, on this instance's disk (E1). `bytes` stops at maxBytes; `tooLarge` says the part went past it. */
export type SpooledFile = { path: string; bytes: number; claimedType: string; head: Buffer; tooLarge: boolean };
export type Upload = { fields: ReadonlyMap<string, string>; file?: SpooledFile; dispose(): Promise<void> };

/** E13: a body over twice the limit is refused before it is read. */
export const tooLargeToRead = (headers: IncomingHttpHeaders, maxBytes: number) => Number(headers["content-length"] ?? 0) > 2 * maxBytes;

/**
 * Reads a multipart body without holding it in memory (decision 2, E1): text fields into a map, the `file` part into a
 * temp file, counting its bytes and keeping its first 16 for sniffing. Any order of parts. A second file and unknown file
 * fields are drained and dropped. Not multipart at all: no fields, no file (the caller's "Attach a file"). The caller
 * runs its checks, stores `file.path` if they pass, and always calls `dispose()`.
 */
export async function readUpload(req: Readable & { headers: IncomingHttpHeaders }, { maxBytes }: { maxBytes: number }): Promise<Upload> {
  const fields = new Map<string, string>();
  if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
    req.resume();
    return { fields, dispose: async () => undefined };
  }
  await mkdir(DIR, { recursive: true });
  let file: SpooledFile | undefined;
  const writes: Promise<void>[] = [];
  const parser = busboy({ headers: req.headers, limits: { files: 1, fields: 8, parts: 10, fieldSize: FIELD_BYTES, fileSize: maxBytes } });
  parser.on("field", (name, value, info) => {
    if (!info.valueTruncated) fields.set(name, value);
  });
  parser.on("file", (name, stream, info) => {
    if (name !== "file" || file) return void stream.resume();
    const spooled: SpooledFile = { path: join(DIR, randomUUID()), bytes: 0, claimedType: info.mimeType, head: Buffer.alloc(0), tooLarge: false };
    file = spooled;
    stream.on("limit", () => (spooled.tooLarge = true)); // busboy stops passing bytes at maxBytes and drains the rest
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (spooled.head.length < HEAD_BYTES) spooled.head = Buffer.concat([spooled.head, chunk.subarray(0, HEAD_BYTES - spooled.head.length)]);
        spooled.bytes += chunk.length;
        done(null, chunk);
      },
    });
    writes.push(pipeline(stream, count, createWriteStream(spooled.path)));
  });
  const dispose = async () => {
    if (file) await rm(file.path, { force: true });
  };
  try {
    await pipeline(req, parser);
    await Promise.all(writes);
  } catch {
    await dispose();
    throw new BadRequestException("The upload didn't arrive whole. Try again.");
  }
  return { fields, file, dispose };
}
```

`multipart.test.ts` builds bodies with `FormData` and `new Request(…).arrayBuffer()` and feeds them as a `Readable`
with the request's `content-type` header. It covers these cases:
- `meta` then `file`, and `file` then `meta`: same result. Fields are read, and the temp file's bytes equal the
  part's.
- A part of `maxBytes + 1` gives `tooLarge` true and `bytes === maxBytes`. A part of exactly `maxBytes` isn't too
  large: the mock refuses only `size > max`.
- Fed in 1-byte chunks, `head` is still the first 16 bytes.
- A second file is dropped. A non-`file` file field is dropped. A JSON body has no file and no fields.
- A field over 64 KiB is absent.
- `dispose()` removes the temp file. A body cut off mid-part throws the 400 and leaves no temp file behind.
- `tooLargeToRead` is false at exactly `2 × max` and true above it.

`sniff` gets a case per signature and one for an SVG (`<svg`), a GIF (`GIF89a`) and text.

#### Step 5.2: The patient photo: spooled upload, 302 read

**File:** `apps/api/src/patients/patient-photo.ts`, `patient-photo.test.ts`, `patients.controller.ts`, `patient-writes.service.ts`, `patients.service.ts`
**Verify:** `pnpm run check -- patient-photo`

`cleanPhoto(file: SpooledFile)`; no `FileInterceptor`; `GET` answers a 302 to a 5-minute link. The mock's order and
words don't change. Only the transport changes, plus the 413 cap (E13).

```diff
// apps/api/src/patients/patient-photo.ts
-import type { FileExtension } from "../storage/storage";
+import type { SpooledFile } from "../storage/multipart";
+import { IMAGE_EXTENSIONS, sniff } from "../storage/sniff";
+import type { FileExtension } from "../storage/storage";
@@
-/** What multer (memory storage) hands the controller. `mimetype` is what the browser declared. */
-export type PhotoUpload = { buffer: Buffer; mimetype: string; size: number };
-
-const SIGNATURES: [FileExtension, (b: Buffer) => boolean][] = [ … ];
-
 /**
  * What may be stored as a child's photo. The mock's checks (an image type, under 10 MB), then the bytes must be a
  * JPEG, PNG or WebP: what the web's downscaler produces. Anything else, an SVG or a GIF included, is refused with the
  * mock's words, so nothing that can carry script is ever served from the API's origin.
  */
-export function cleanPhoto(file: PhotoUpload | undefined): { ext: FileExtension; body: Buffer } | { problem: string; status: 400 | 413 } {
-  if (!file || !file.mimetype.startsWith("image/")) return { problem: NOT_AN_IMAGE, status: 400 };
-  if (file.size > MAX_PHOTO_BYTES) return { problem: PHOTO_TOO_LARGE, status: 413 };
-  const hit = SIGNATURES.find(([, is]) => is(file.buffer));
-  return hit ? { ext: hit[0], body: file.buffer } : { problem: NOT_AN_IMAGE, status: 400 };
+export function cleanPhoto(file: SpooledFile | undefined): { ext: FileExtension } | { problem: string; status: 400 | 413 } {
+  if (!file || !file.claimedType.startsWith("image/")) return { problem: NOT_AN_IMAGE, status: 400 };
+  if (file.tooLarge) return { problem: PHOTO_TOO_LARGE, status: 413 };
+  const ext = sniff(file.head);
+  return ext && IMAGE_EXTENSIONS.includes(ext) ? { ext } : { problem: NOT_AN_IMAGE, status: 400 };
 }
```

```diff
// apps/api/src/patients/patients.controller.ts
-/** Multer stops reading at MAX_PHOTO_BYTES and Nest answers "File too large"; this gives the mock's words. */
-@Catch(PayloadTooLargeException)
-class PhotoTooLarge implements ExceptionFilter { … }
@@
-  // Memory storage, at most 10 MB read (the mock's limit). The web downscales first; B10 moves photos to presigned uploads.
+  // Streamed to a temp file, checked, then streamed to storage (decision 2, E1): never whole in memory. The body is read
+  // by the service, after the 404 (the mock's order).
   @Put("patients/:id/photo")
-  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
-  @UseFilters(PhotoTooLarge)
-  uploadPhoto(@Req() req: Request, @Param("id") id: string, @UploadedFile() file: PhotoUpload | undefined) {
-    return this.writes.uploadPhoto(viewer(req), id, file);
+  uploadPhoto(@Req() req: Request, @Param("id") id: string) {
+    return this.writes.uploadPhoto(viewer(req), id, req);
   }
 
-  // The <img> request carries the API's httpOnly cookie, so the guard sees the session as for any read.
+  // The <img> request carries the API's httpOnly cookie, so the guard sees the session as for any read. Answers a 302 to a
+  // private link valid 5 minutes (decision 3, E2); no-store, so each open is checked and audited again.
   @Get("patients/:id/photo")
-  async photo(@Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
-    const found = await this.patients.photo(id);
-    if (!found) throw new NotFoundException("No photo");
-    res.set({ "Content-Disposition": `inline; filename="${found.name}"`, "X-Content-Type-Options": "nosniff" });
-    return new StreamableFile(found.file.body, { type: found.file.contentType });
+  async photo(@Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<void> {
+    const link = await this.patients.photoLink(id);
+    if (!link) throw new NotFoundException("No photo");
+    res.set("Cache-Control", "no-store").redirect(302, link);
   }
```

Drop the unused imports from the controller: `Catch`, `ExceptionFilter`, `ArgumentsHost`, `PayloadTooLargeException`,
`StreamableFile`, `UploadedFile`, `UseFilters`, `UseInterceptors`, `FileInterceptor`, `MAX_PHOTO_BYTES`,
`PHOTO_TOO_LARGE` and `PhotoUpload`. TypeScript's `noUnusedLocals` decides which are left. Check that `res.redirect`
with `passthrough: true` doesn't make Nest send a second body. If it does, use `@Res()` without passthrough and end
the response there.

```diff
// apps/api/src/patients/patient-writes.service.ts
-  /** PUT /patients/:id/photo: checked (cleanPhoto), stored, then swapped in. 404 before the file is looked at. */
-  async uploadPhoto(viewer: Viewer, id: string, file: PhotoUpload | undefined): Promise<PatientView> {
-    await this.patients.one(id); // the mock's order: 404 first
-    const clean = cleanPhoto(file);
-    if ("problem" in clean) throw clean.status === 413 ? new PayloadTooLargeException(clean.problem) : new BadRequestException(clean.problem);
-    // Stored before the transaction: runInTransaction reruns its callback on a deadlock (CONVENTIONS → Traps).
-    return this.swapPhoto(viewer, id, await this.storage.put("patients", clean.ext, clean.body));
+  /** PUT /patients/:id/photo: 404, then the body is spooled (E1), checked (cleanPhoto), stored, then swapped in. */
+  async uploadPhoto(viewer: Viewer, id: string, req: Request): Promise<PatientView> {
+    await this.patients.one(id); // the mock's order: 404 before the body is read
+    if (tooLargeToRead(req.headers, MAX_PHOTO_BYTES)) throw new PayloadTooLargeException(PHOTO_TOO_LARGE);
+    const upload = await readUpload(req, { maxBytes: MAX_PHOTO_BYTES });
+    try {
+      const clean = cleanPhoto(upload.file);
+      if ("problem" in clean) throw clean.status === 413 ? new PayloadTooLargeException(clean.problem) : new BadRequestException(clean.problem);
+      // Stored before the transaction: runInTransaction reruns its callback on a deadlock (CONVENTIONS → Traps).
+      return await this.swapPhoto(viewer, id, await this.storage.putFile("patients", clean.ext, upload.file!));
+    } finally {
+      await upload.dispose();
+    }
   }
```

Imports: `readUpload`, `tooLargeToRead` from `../storage/multipart`; `MAX_PHOTO_BYTES`, `PHOTO_TOO_LARGE` from
`./patient-photo`; `type Request` from `express`. Remove `PhotoUpload`.

```diff
// apps/api/src/patients/patients.service.ts
-  /** GET /patients/:id/photo. One audit entry per view (decision 4), only when there is a photo to see. */
-  async photo(id: string): Promise<{ file: StoredFile; name: string } | undefined> {
-    const row = await this.prisma.patient.findUnique({ where: { id }, select: { photoRef: true, firstName: true, lastName: true } });
-    const file = row?.photoRef ? await this.storage.get(row.photoRef) : undefined;
-    if (!row || !file) return undefined;
-    await this.audit.record("view", "Patient photo", id);
-    return { file, name: photoFileName(row) };
+  /** GET /patients/:id/photo: a 5-minute private link (E2). One audit entry per view (decision 4), only when there is a photo. */
+  async photoLink(id: string): Promise<string | undefined> {
+    const row = await this.prisma.patient.findUnique({ where: { id }, select: { photoRef: true, firstName: true, lastName: true } });
+    const link = row?.photoRef ? await this.storage.link(row.photoRef, { fileName: photoFileName(row) }) : undefined;
+    if (!link) return undefined;
+    await this.audit.record("view", "Patient photo", id);
+    return link;
   }
```

`patient-photo.test.ts` replaces its buffer fixtures with `SpooledFile` objects (`head` = the fixture's first 16 bytes,
`bytes`, `tooLarge`). Cases: no file and `text/plain` give 400 "Attach an image file". `tooLarge` gives 413 "Images
must be under 10 MB". An `image/png` claim on SVG bytes, or on a GIF, is 400. JPEG, PNG and WebP pass with their
extension. A claim of `image/png` on JPEG bytes passes as `jpg`: the bytes decide, as B4 did.

#### Step 5.3: The patient photo on MySQL, through the link

**File:** `apps/api/test/int/patient-photo.int.test.ts`

No `Verify:` line: the file exists, so `test -f` proves nothing, and `test:int` isn't on the allowlist. Run it with
`pnpm --filter api test:int test/int/patient-photo.int.test.ts` and record it in the implementation log.

The existing reads assert 200 and a content type (lines 62–64, 82, 124). They now follow one redirect:

```ts
/** GET and follow the 302 once (the local driver's /api/files/<token>), as a browser does. */
async function open(cookie: string, path: string) {
  const first = await http().get(path).set("Cookie", cookie);
  if (first.status !== 302) return { first, file: undefined };
  expect(first.headers["cache-control"]).toBe("no-store");
  const file = await http().get(first.headers.location!).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on("data", (c: Buffer) => chunks.push(c)).on("end", () => done(null, Buffer.concat(chunks)));
  });
  return { first, file };
}
```

- "stores, serves and removes": `open(cookie, …/photo)`. The first answer is 302 to `/api/files/…`. The file is 200
  `image/jpeg` with `nosniff` and `Content-Security-Policy: sandbox`, and its body equals the uploaded bytes.
- The PNG case reads the file's content type through the link.
- A parent's own child gives 302 then 200; another child is still 403 with the guard's words.
- **New:** the upload streams. A 9.9 MB JPEG (a valid header plus padding) is stored and its `StoredFile.bytes` equals
  the length. A part of 10 MB + 1 byte is 413 with the mock's words. A `Content-Length` over 20 MB is 413 before the
  body is read: send headers only, with `.set("Content-Length", …)` and an aborted body, and expect the 413.
- **New:** no temp file is left behind. After each upload, success or refusal, `primolar-uploads` holds no file the
  test created (compare the directory listing before and after).
- **New:** a link expires. With the app's `Clock` advanced 301 s (the int app's clock override), the old
  `/api/files/<token>` is 404 `LINK_GONE`, and a new `GET …/photo` gives a fresh 302 that works.
- Ngiti's Owner: `GET` Bulilit's child's `/photo` is 404 "Patient not found" (tenant scope). Inside Ngiti's context,
  `StorageService.link(bulilitKey)` is `undefined` (line 138's case, extended to links).

Check whether `createIntApp` lets a test replace `Clock`, the way B7 and B9's int tests move time. If it doesn't, use
`vi.setSystemTime` only around the `open` call, because `LocalDiskStorage`'s `nowMs` is the module's `Clock`.

#### Phase 5 — Potential Issues

- **Breaking change for the web:** `GET /patients/:id/photo` answers 302, not 200. `<img src>` follows it with no code
  change (`patient-avatar.tsx:26`). In `hybrid`, the redirect goes through MSW's passthrough, then Next's proxy, then
  the API, and the link `/api/files/…` comes back the same way. **`/files/:token` must be in `API_ROUTES`** (Step
  9.1), or MSW's gate answers it 403 when a new tab opens it. An `<img>` request isn't affected, because its redirect
  is followed inside the service worker's own fetch.
- **A photo row whose file is gone** now gives a 302 to a link that 404s (S3: 404 XML), where B4 answered 404
  "No photo". The avatar's `onError` already falls back to initials. Accepted: the row is the record, and a missing
  file is an operations problem.
- **Unit tests that built the controller with multer:** `test/patients-routes.test.ts` only asserts 401 without a
  session, so it is unaffected.
- **Express body parsers:** Nest's JSON and urlencoded parsers ignore `multipart/form-data`, so the request stream
  is unread when the service gets it. If a global raw or text parser is ever added, these routes break; Step 9.3
  records this as a trap.
- **Temp disk:** at most 10 MB per concurrent upload under `os.tmpdir()`. A container with a small `/tmp` needs room
  for (instances × concurrent uploads × 10 MB). Step 9.3 records this as a deployment note.
- **New patterns:** `readUpload` (E1, flagged in §1). `sniff` is B4's signatures moved, not new.

**Issues identified:** `/files/:token` must pass through MSW in `hybrid` (planned in Step 9.1).

## B10d: Photos

### Phase 6: `PhotosModule`

#### Step 6.1: Rows and the file rule

**File:** `apps/api/src/photos/photo.rows.ts` (new), `apps/api/src/photos/photo-file.ts` (new), `apps/api/src/photos/photo-file.test.ts` (new)
**Verify:** `pnpm run check -- photo-file`

`photoRow`/`toPhoto`; `photoFileProblem(type, file)` = `uploadProblem` then `sniff`, the mock's words.

```ts
// apps/api/src/photos/photo-file.ts (new)
import { PDF, UPLOAD_RULES, uploadProblem, type PhotoType } from "@pedia/shared";
import type { SpooledFile } from "../storage/multipart";
import { IMAGE_EXTENSIONS, sniff } from "../storage/sniff";
import type { FileExtension } from "../storage/storage";

/**
 * Whether this spooled file may be stored as a `type` photo (E4). First the shared uploadProblem, with the mock's words
 * and its status rule (413 whenever the file is too large, whichever problem is named: photos/mocks.ts:41). Then the
 * bytes: an image claim must be JPEG, PNG or WebP, a PDF claim must be a PDF, refused with the words uploadProblem uses
 * for a wrong type.
 */
export function photoFileProblem(type: PhotoType, file: SpooledFile): { ext: FileExtension } | { problem: string; status: 400 | 413 } {
  const size = file.tooLarge ? UPLOAD_RULES.maxBytes + 1 : file.bytes;
  const problem = uploadProblem(type, { type: file.claimedType, size });
  if (problem) return { problem, status: file.tooLarge ? 413 : 400 };
  const ext = sniff(file.head);
  const fits = file.claimedType === PDF ? ext === "pdf" : !!ext && IMAGE_EXTENSIONS.includes(ext);
  if (fits) return { ext: ext! };
  // The wrong-type words for this photo type, from the one copy of them (a type no rule accepts).
  return { problem: uploadProblem(type, { type: "application/octet-stream", size: 0 })!, status: 400 };
}
```

```ts
// apps/api/src/photos/photo.rows.ts (new)
import type { ClinicalPhoto, UploadPhotoInput } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** The columns a response needs; `fileKey` and `bytes` stay inside the API. */
export const PHOTO_SELECT = {
  id: true, clinicId: true, patientId: true, visitId: true, type: true, stage: true, tooth: true, takenOn: true,
  caption: true, contentType: true, uploadedBy: true, createdAt: true,
} as const satisfies Prisma.ClinicalPhotoSelect;
type PhotoRow = Prisma.ClinicalPhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

/** Contract input → row columns. `takenOn` is a calendar date (@db.Date), written as the API's other dates are. */
export const photoData = ({ visitId, type, stage, tooth, takenOn, caption }: UploadPhotoInput) => ({
  visitId: visitId ?? null, type, stage: stage ?? null, tooth: tooth ?? null, takenOn: new Date(`${takenOn}T00:00:00.000Z`), caption,
});

/** Row → ClinicalPhoto. Absent optionals are left out, not null (the contract's `.optional()`). */
export const toPhoto = (r: PhotoRow): ClinicalPhoto => ({
  id: r.id, clinicId: r.clinicId, patientId: r.patientId,
  ...(r.visitId && { visitId: r.visitId }), type: r.type, ...(r.stage && { stage: r.stage }), ...(r.tooth !== null && { tooth: r.tooth }),
  takenOn: r.takenOn.toISOString().slice(0, 10), caption: r.caption, contentType: r.contentType, uploadedBy: r.uploadedBy,
  createdAt: r.createdAt.toISOString(),
});
```

`photoData` and `takenOn` must write and read dates the way `visit.rows.ts` does for `Visit.date`. Use that file's
helper if it has one (and the seed's `dateOnly`) rather than the inline `new Date(…Z)`.

`photo-file.test.ts` (in the same directory) has one case per branch:
- `text/plain` as `intraoral` gives 400 "Attach an image file"; as `document` it gives "Attach a photo or a PDF".
- A too-large JPEG gives 413 "Files must be under 10 MB". A too-large `text/plain` gives 413 "Attach an image file"
  (the mock's quirk, kept).
- A PDF claim and PDF bytes as `referral` give `pdf`. The same as `intraoral` gives 400 "Attach an image file".
- A PDF claim with PNG bytes gives 400 "Attach a photo or a PDF".
- An `image/jpeg` claim with PNG bytes gives `png`. With `<svg` bytes it is 400.

There is also a `toPhoto` round trip: `ClinicalPhoto.parse(toPhoto(row))` holds with and without the optionals.

#### Step 6.2: Service, controller, module, record owner

**File:** `apps/api/src/photos/photos.service.ts`, `photos.controller.ts`, `photos.module.ts` (new), `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`
**Verify:** `pnpm run check -- clinical-routes`

The three routes in the mock's order; consent again under the lock (E6); 302 on open.

```ts
// apps/api/src/photos/photos.service.ts (new)
import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import {
  CONSENTED_PHOTO_TYPES, UPLOAD_RULES, UploadPhotoInput, choiceDeclined, photoFileName, rolesCan,
  type ClinicalPhoto, type Patient, type PhotoType,
} from "@pedia/shared";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import { Clock } from "../common/clock";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { OutboxService } from "../outbox/outbox.service";
import { lockPatient } from "../patients/patient-lock";
import type { Viewer } from "../patients/patient.views";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction } from "../prisma/transaction";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { readUpload, tooLargeToRead } from "../storage/multipart";
import { CONTENT_TYPES } from "../storage/storage";
import { StorageService } from "../storage/storage.service";
import { VisitsService } from "../visits/visits.service";
import { photoFileProblem } from "./photo-file";
import { PHOTO_SELECT, photoData, toPhoto } from "./photo.rows";

/** What a parent may upload from the portal (photos/mocks.ts:10). Clinical imaging (X-rays) is the clinic's. */
const PARENT_TYPES: readonly PhotoType[] = ["intraoral", "extraoral", "document"];
const declined = (patient: Patient, type: PhotoType) => CONSENTED_PHOTO_TYPES.includes(type) && choiceDeclined(patient, "photos");
const declinedWords = (p: Patient) =>
  `${p.firstName}'s family declined clinical photos. Staff can change this under Privacy on the child's Overview; parents on the portal's Home page.`;

/**
 * Clinical photos and parents' medical documents (features/photos/mocks.ts). The only reader and writer of ClinicalPhoto.
 * Uploads are spooled, checked in the mock's order, then stored (E1); the row is written under the patient's lock with
 * consent read again (E6). Opening a file is a 5-minute link (E2). Never updated or deleted (decision 5).
 */
@Injectable()
export class PhotosService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly owners: RecordOwners,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    this.owners.register("/photos/:id/file", (id) => this.patientOf(id)); // a parent's own-scope check (E12)
  }

  async patientOf(id: string): Promise<string | undefined> {
    return (await this.prisma.clinicalPhoto.findUnique({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** GET /patients/:id/photos: newest first; without clinical.view (a parent), only what parents uploaded. */
  async list(viewer: Viewer, patientId: string): Promise<ClinicalPhoto[]> {
    const clinical = rolesCan(viewer.roles, "clinical.view");
    const rows = await this.prisma.clinicalPhoto.findMany({
      where: { patientId, ...(!clinical && { uploadedBy: "parent" as const }) },
      orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
      select: PHOTO_SELECT,
    });
    await this.audit.record("view", "Photos", patientId);
    return rows.map(toPhoto);
  }

  /** POST /patients/:id/photos: multipart `file` + `meta`. Every refusal in the mock's order (photos/mocks.ts:26–73). */
  async upload(viewer: Viewer, patientId: string, req: Request): Promise<ClinicalPhoto> {
    if (!(await this.patients.exists(patientId))) throw new NotFoundException("Patient not found");
    if (tooLargeToRead(req.headers, UPLOAD_RULES.maxBytes)) throw new PayloadTooLargeException("Files must be under 10 MB");
    const upload = await readUpload(req, { maxBytes: UPLOAD_RULES.maxBytes });
    try {
      const { file } = upload;
      if (!file) throw new BadRequestException("Attach a file");
      let meta: unknown;
      try {
        meta = JSON.parse(upload.fields.get("meta") ?? "null"); // the mock's String(null): a missing meta fails the schema
      } catch {
        throw new BadRequestException("`meta` must be JSON");
      }
      const parsed = UploadPhotoInput.safeParse(meta);
      if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
      const input = parsed.data;
      const checked = photoFileProblem(input.type, file);
      if ("problem" in checked) throw checked.status === 413 ? new PayloadTooLargeException(checked.problem) : new BadRequestException(checked.problem);
      const patient = await this.patients.one(patientId);
      if (declined(patient, input.type)) throw new ConflictException(declinedWords(patient));
      const fromParent = !rolesCan(viewer.roles, "clinical.write");
      if (fromParent && (!PARENT_TYPES.includes(input.type) || input.visitId || input.stage || input.tooth)) {
        throw new BadRequestException("Upload a photo or a medical document");
      }
      if (input.visitId && (await this.visits.patientOf(input.visitId)) !== patientId) throw new BadRequestException("Visit not found");

      // Stored before the transaction (slow work first; runInTransaction may rerun its callback).
      const key = await this.storage.putFile("photos", checked.ext, file);
      const saved = await runInTransaction(this.prisma, async (tx) => {
        await lockPatient(tx, patientId); // before any read (CONVENTIONS → Traps); privacy choices hold the same lock
        if (declined(await this.patients.one(patientId, tx), input.type)) {
          await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key } }); // E6: a "no" landed in between
          return undefined;
        }
        const row = await tx.clinicalPhoto.create({
          data: {
            ...clinicData(), ...photoData(input), patientId, contentType: CONTENT_TYPES[checked.ext],
            uploadedBy: fromParent ? "parent" : "staff", fileKey: key, bytes: file.bytes, createdAt: this.clock.now(),
          },
          select: PHOTO_SELECT,
        });
        await this.audit.record("create", "Photo", patientId, tx);
        return toPhoto(row);
      });
      if (!saved) throw new ConflictException(declinedWords(patient));
      return saved;
    } finally {
      await upload.dispose();
    }
  }

  /** GET /photos/:id/file: a 5-minute link, or undefined (404) for an unknown photo or a parent on clinical imaging. */
  async fileLink(viewer: Viewer, id: string, download: boolean): Promise<string | undefined> {
    const row = await this.prisma.clinicalPhoto.findUnique({
      where: { id },
      select: { patientId: true, type: true, tooth: true, takenOn: true, contentType: true, uploadedBy: true, fileKey: true },
    });
    if (!row || (row.uploadedBy !== "parent" && !rolesCan(viewer.roles, "clinical.view"))) return undefined;
    const patient = await this.patients.one(row.patientId);
    const photo = { type: row.type, tooth: row.tooth ?? undefined, takenOn: row.takenOn.toISOString().slice(0, 10), contentType: row.contentType };
    const link = await this.storage.link(row.fileKey, { fileName: photoFileName(patient, photo), download });
    if (!link) return undefined;
    await this.audit.record("view", "Photo", row.patientId);
    return link;
  }
}
```

```ts
// apps/api/src/photos/photos.controller.ts (new)
import { Controller, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { viewerOf } from "../patients/patient.views";
import { PhotosService } from "./photos.service";

const viewer = (req: Request) => viewerOf(identityOf(req)!);

/** features/photos/mocks.ts. Rules: access-rules.ts (clinical.view/write or uploads.create; a parent for their own child). */
@Controller()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get("patients/:id/photos")
  list(@Req() req: Request, @Param("id") id: string) {
    return this.photos.list(viewer(req), id);
  }

  // multipart/form-data: `file` and `meta` (UploadPhotoInput as JSON), in any order; read by the service after the 404 (E1).
  @Post("patients/:id/photos")
  upload(@Req() req: Request, @Param("id") id: string) {
    return this.photos.upload(viewer(req), id, req);
  }

  // A 302 to a private link valid 5 minutes (decision 3); `?download=1` saves it (C1). no-store: every open is checked.
  @Get("photos/:id/file")
  async file(@Req() req: Request, @Param("id") id: string, @Query("download") download: unknown, @Res({ passthrough: true }) res: Response) {
    const link = await this.photos.fileLink(viewer(req), id, download === "1");
    if (!link) throw new NotFoundException("Photo not found");
    res.set("Cache-Control", "no-store").redirect(302, link);
  }
}
```

```ts
// apps/api/src/photos/photos.module.ts (new)
import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PatientsModule } from "../patients/patients.module";
import { StorageModule } from "../storage/storage.module";
import { VisitsModule } from "../visits/visits.module";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

/** B10: clinical photos. A leaf: nothing imports it, so it can't close a cycle. */
@Module({ imports: [AuditModule, AuthModule, OutboxModule, PatientsModule, StorageModule, VisitsModule], controllers: [PhotosController], providers: [PhotosService] })
export class PhotosModule {}
```

Add `PhotosModule` to `AppModule.forRoot`'s imports. Check `OutboxService`'s real export path and name
(`src/outbox/`), and whether `PatientsService.exists` and `.one` throw or return (`.one` throws the 404, which is why
`upload` calls `exists` first: the mock's 404 words "Patient not found"). If `patients.one`'s 404 already says
"Patient not found", call `one` once instead.

`test/clinical-routes.test.ts`, new list:

```ts
/** B10's routes, the same promise. A POST without a session is refused before its body is read. */
const B10_ROUTES: [Method, string][] = [
  ["get", "/patients/p1/photos"],
  ["post", "/patients/p1/photos"],
  ["get", "/photos/ph1/file"],
  ["get", "/documents"],
  ["get", "/patients/p1/documents"],
  ["post", "/patients/p1/documents"],
];
```

Add it to the loop that asserts 401. The documents routes go red until Step 7.2. **Add them in Step 7.2**, so that
this step's gate passes on a correct tree; only the three photo rows are added here.

#### Step 6.3: Photos on MySQL: the done-when

**File:** `apps/api/test/int/photos.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/photos.int.test.ts`

The mock's three cases, refusal order, parents, consent race, cross-clinic isolation, a restart, stored bytes. The
setup follows `patient-photo.int.test.ts`: `createIntApp({ env: { STORAGE_DIR: mkdtemp } })`, a seeded database, and
`open()` (Step 5.3) moved into `test/int/support/files.ts` so that both files share it. Fixtures are a 3-byte JPEG
header plus padding, a real 1×1 PNG, `%PDF-1.4…`, and `<svg…>`. Staff uploads use the dentist (`staff_reyes`).
Front desk (`staff_cruz`) holds `clinical.view` but neither `clinical.write` nor `uploads.create`
(`permissions.ts:45–66`), so the guard refuses its upload with 403. Assert that too: it is the access rule, not the
service.

1. **The mock's first case.** Before and after on tooth 74 list as `[after, before]`. Opening `before` gives a 302
   with `no-store`, then 200 `image/jpeg` with the same bytes.
2. **The mock's second case.** `text/plain` is 400 "Attach an image file". Tooth 19 is 400 with Zod issues (an
   array). Another child's visit is 400 "Visit not found".
3. **The mock's third case.** A PDF as `document` gives 201 with `contentType` `application/pdf`. Open is `inline;
   filename="…-document-<date>.pdf"`. `?download=1` is `attachment`. The same PDF as `intraoral` is 400.
4. **The order, one refusal at a time, exact words:** unknown child 404; no `file` part 400 "Attach a file";
   `meta=oops` 400 "`meta` must be JSON"; no `meta` 400 issues; too large 413 "Files must be under 10 MB"; JPEG claim
   with SVG bytes 400; the seed's declined child (index 11) `intraoral` 409 with the mock's words, while an `xray` for
   them is 201 (only intraoral and extraoral need consent); a parent's `xray` 400 "Upload a photo or a medical
   document"; a parent's `intraoral` with a tooth 400; a parent's `document` for their own child 201 with
   `uploadedBy: "parent"`. A request that fails both the meta check and the size check gets the meta answer, which
   shows the order.
5. **The bytes decide.** A JPEG claim with PNG bytes is stored as `image/png`, and opens as `image/png`.
6. **Parents (E12).** The list shows only parent uploads. A staff photo of their own child opens as 404 "Photo not
   found". Their own upload opens as 302 then 200. Another family's photo is 403 with the guard's words.
7. **Consent race (E6), deterministic.** Wrap `StorageService.putFile` once (`vi.spyOn(…).mockImplementationOnce`) so
   that, after storing, it calls `POST /patients/:id/privacy-choices` with photos off for the same child. The upload
   answers 409 with the declined words. No `ClinicalPhoto` row exists. One `storage.delete` outbox row names the key,
   and after `worker.drain()` the file and its `StoredFile` row are gone. **Mutation:** with the in-transaction
   re-check removed, this test fails (row present).
8. **Cross-clinic isolation (done-when, decision 3).**
   - Ngiti's Owner opening a Bulilit photo id is 404 "Photo not found", the same answer as an id that never existed.
   - Ngiti posting to a Bulilit child is 404.
   - In Ngiti's context, `StorageService.link(bulilitKey)` and `.get(bulilitKey)` are `undefined`.
   - A `/api/files/` token whose claims were re-encoded with a Bulilit key it wasn't signed for is 404.
9. **Survives a restart (done-when).** Upload, `app.close()`, then a new `createIntApp` on the same `STORAGE_DIR` and
   database. The photo lists, opens through a fresh 302 and returns the same bytes. The old app's link is 404 on the
   new app (no `STORAGE_LINK_SECRET`: links don't outlive the process; files do).
10. **Stored bytes (decision 8).** After two uploads, Bulilit's `usedBytes()` grew by exactly their sizes and Ngiti's
    is unchanged. A refused upload (any 4xx before storing) adds nothing. The race in case 7 adds and then removes.
11. **Audit.** One "Photos" `view` per list read. One "Photo" `create` per stored upload, in its transaction: a
    refused upload has none. One "Photo" `view` per open, deduplicated inside `REPEAT_WINDOW_MS`.
12. **No delete.** `DELETE /api/photos/<id>` is Nest's 404, because there is no route. `prisma.clinicalPhoto.update`
    in context throws the append-only refusal.
13. **No temp files left** under `primolar-uploads` after the whole file runs (`afterAll`).

#### Phase 6 — Potential Issues

- **Type mismatches:** Prisma's `PhotoType`, `PhotoStage` and `UploadedBy` enum types must be assignable from the
  shared ones in `photoData`. They share their values, so they are. Wherever TypeScript disagrees, cast through the
  shared type and let `toPhoto`'s round-trip test catch any drift.
- **Who is a "parent" (E12):** the mock decides by `clinical.write`, not by role. Today that is exact: only parents
  reach the route without it, because the rule needs `clinical.write` or `uploads.create` and only parents hold
  `uploads.create`. If a staff role ever gains `uploads.create` without `clinical.write`, it would get parent rules.
  Keep the mock's rule.
- **`patients.one` inside the transaction** reads the whole child: guardians, consents and choices, three or four
  queries. That is acceptable for an upload. A narrower `photosDeclined(tx, id)` on `PatientsService` would be one
  query (Follow-up).
- **Lock order (CONVENTIONS → Traps):** account → patient → child rows. Upload takes only the patient's lock and
  writes the photo row and an outbox row after it, which fits the order.
- **Edge cases:** an unknown child's list is `[]` and still audited, as the mock (its gate audits every rule with
  `audit`). An empty `caption` is allowed (`z.string()`).
- **Cross-cutting registration:** the module in `AppModule`; the record owner (`/photos/:id/file`), which
  `RecordOwners.register` throws on if it is registered twice; the three photo routes in `clinical-routes.test.ts`.
- **New patterns:** none beyond E1 and E6. The re-check under the lock is the B9 E7 pattern applied to files.

**Issues identified:** none.

## B10e: Documents

### Phase 7: `DocumentsModule`

#### Step 7.1: The rule and the rows

**File:** `apps/api/src/documents/documents.rules.ts` (new), `documents.rules.test.ts` (new), `document.rows.ts` (new)
**Verify:** `pnpm run check -- documents.rules`

`documentRefusal(input, facts)` in the mock's order, one test per branch. The facts are gathered by the service (Step
7.2), so the rule stays pure, as `chart.rules.ts` and `billing.rules.ts` are.

```ts
// apps/api/src/documents/documents.rules.ts (new)
import {
  DENTIST_SIGNED, DOCUMENT_SOURCE, DOCUMENT_TYPE_LABEL, allergyConflicts, holdsRole,
  type GenerateDocumentInput, type StaffMember,
} from "@pedia/shared";
import type { Refusal } from "../common/refusal";

/** What the mock reads from its db to judge a document (documents/mocks.ts:54–63). */
export type DocumentFacts = {
  /** Any staff row of this clinic with that id, deactivated included (the mock's db.staff); undefined when none. */
  issuer: Pick<StaffMember, "role" | "alsoRoles"> | undefined;
  /** sourceFits (documents/mocks.ts:18–32); true for a type that needs no source. */
  sourceFits: boolean;
  patient: { firstName: string; allergies: string[] };
};

/** The mock's refusals after the body parsed, in its order: issuer, dentist, source, allergy (decision 6). */
export function documentRefusal(input: GenerateDocumentInput, facts: DocumentFacts): Refusal | undefined {
  if (!facts.issuer) return { status: 400, message: "Unknown staff member" };
  if (DENTIST_SIGNED.includes(input.type) && !holdsRole(facts.issuer, "dentist")) {
    return { status: 400, message: `A dentist has to issue the ${DOCUMENT_TYPE_LABEL[input.type].toLowerCase()}` };
  }
  if (!facts.sourceFits) return { status: 400, message: `${DOCUMENT_SOURCE[input.type]?.missing} for this patient` };
  const clash = allergyConflicts(facts.patient.allergies, input.items ?? []);
  if (clash.length) {
    const { firstName, allergies } = facts.patient;
    return { status: 409, message: `${firstName} is allergic to ${clash.map((d) => d.name).join(", ")} (recorded: ${allergies.join(", ")})` };
  }
  return undefined;
}

/** The logged title (documents/mocks.ts:70). */
export const documentTitle = (input: Pick<GenerateDocumentInput, "type">, p: { firstName: string; lastName: string }) =>
  `${DOCUMENT_TYPE_LABEL[input.type]} · ${p.firstName} ${p.lastName}`;
```

```ts
// apps/api/src/documents/document.rows.ts (new)
import { DocumentDetails, PrescriptionItem, type GenerateDocumentInput, type PatientDocument } from "@pedia/shared";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";

export const DOCUMENT_SELECT = {
  id: true, clinicId: true, patientId: true, type: true, title: true, sourceId: true, details: true, items: true, issuedBy: true, createdAt: true,
} as const satisfies Prisma.PatientDocumentSelect;
type DocumentRow = Prisma.PatientDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

/** Contract input → columns. JSON columns hold exactly what GenerateDocumentInput returned. */
export const documentData = ({ type, sourceId, details, items, issuedBy }: GenerateDocumentInput) => ({
  type, sourceId: sourceId ?? null, details: details ?? undefined, items: items ?? undefined, issuedBy,
});

/** Row → PatientDocument; the JSON columns parsed back with the shared shapes, absent ones left out. */
export const toDocument = (r: DocumentRow): PatientDocument => ({
  id: r.id, clinicId: r.clinicId, patientId: r.patientId, type: r.type, title: r.title,
  ...(r.sourceId && { sourceId: r.sourceId }),
  ...(r.details != null && { details: z.record(z.string(), z.string()).parse(r.details) }),
  ...(r.items != null && { items: PrescriptionItem.array().parse(r.items) }),
  issuedBy: r.issuedBy, createdAt: r.createdAt.toISOString(),
});
```

Drop the `DocumentDetails` import if shared has no such export; the inline `z.record` is the contract's own shape
(`schemas/document.ts:248`). Prisma `Json?` columns: write `Prisma.DbNull` for "none" if `undefined` doesn't leave the
column `NULL` under the adapter. The round-trip test catches either.

`documents.rules.test.ts`: one case per refusal, plus a dentist's prescription with no clash returning `undefined`.
The cases cover the order with several faults at once: an unknown issuer on a document whose source also fails gives
"Unknown staff member"; a front-desk certificate from a bad source gives the dentist refusal; a dentist's bad source
with an allergic item gives the source refusal. Also covered: the exact words, including the allergy words with two
recorded allergies, and `documentTitle`. A `toDocument` round trip parses with `PatientDocument` with and without
`details`, `items` and `sourceId`.

#### Step 7.2: Service, controller, module and the reads it needs

**File:** `apps/api/src/documents/documents.service.ts`, `documents.controller.ts`, `documents.module.ts` (new), `apps/api/src/clinic/clinic.service.ts`, `apps/api/src/notes/notes.service.ts`, `apps/api/src/app.module.ts`, `apps/api/test/clinical-routes.test.ts`
**Verify:** `pnpm run check -- test/clinical-routes`

Three routes; two narrow reads added to their owners (the issuer's roles, a signed note's procedure). Visits and
payments are read through methods that already exist.

```diff
// apps/api/src/clinic/clinic.service.ts (beside isActiveDentist)
+  /** Any staff row of this clinic, deactivated included (the mock's db.staff: a document names who issued it then). */
+  async staffRoles(id: string): Promise<Pick<StaffMember, "role" | "alsoRoles"> | undefined> {
+    const s = await this.prisma.staff.findUnique({ where: { id }, select: { role: true, alsoRoles: true } });
+    return s ? { role: s.role, alsoRoles: StaffRole.array().parse(s.alsoRoles) } : undefined; // another clinic's id reads as missing
+  }
```

```diff
// apps/api/src/notes/notes.service.ts
+  /** The procedure of a signed note of this patient (a post-op document's source), or undefined. Two one-column reads. */
+  async signedProcedure(noteId: string, patientId: string): Promise<string | undefined> {
+    const note = await this.prisma.clinicalNote.findFirst({ where: { id: noteId, patientId, signedAt: { not: null } }, select: { templateId: true } });
+    if (!note) return undefined;
+    return (await this.prisma.noteTemplate.findFirst({ where: { id: note.templateId }, select: { procedure: true } }))?.procedure;
+  }
```

`NoteTemplate`'s key is `(clinicId, id)` (B3 Reference keys), so `findFirst` with `id` is scoped by the extension.

```ts
// apps/api/src/documents/documents.service.ts (new)
import { Injectable } from "@nestjs/common";
import { DOCUMENT_SOURCE, GenerateDocumentInput, NOTE_MESSAGES, isMoneyIn, type PatientDocument } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { NotesService } from "../notes/notes.service";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { DOCUMENT_SELECT, documentData, toDocument } from "./document.rows";
import { documentRefusal, documentTitle } from "./documents.rules";

const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * The issued-documents log (features/documents/mocks.ts; decision 6). The only reader and writer of PatientDocument.
 * The server checks run on the log request, before any PDF exists: the browser builds the PDF only after a 201, so a
 * refused document never produces a file. Append-only (E7).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly notes: NotesService,
    private readonly billing: BillingRecordsService,
    private readonly clinic: ClinicService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** GET /documents: every document issued across the clinic, newest first, at most 100 (the mock). Not audited (E10). */
  async log(): Promise<PatientDocument[]> {
    return (await this.prisma.patientDocument.findMany({ orderBy: NEWEST_FIRST, take: 100, select: DOCUMENT_SELECT })).map(toDocument);
  }

  /** GET /patients/:id/documents, newest first. [] for an unknown child, as the mock. Audited "Documents". */
  async forPatient(patientId: string): Promise<PatientDocument[]> {
    const rows = await this.prisma.patientDocument.findMany({ where: { patientId }, orderBy: NEWEST_FIRST, select: DOCUMENT_SELECT });
    await this.audit.record("view", "Documents", patientId);
    return rows.map(toDocument);
  }

  /** POST /patients/:id/documents: 404 → 400 issues → the mock's refusals (documentRefusal) → 201. */
  async issue(patientId: string, body: unknown): Promise<PatientDocument> {
    const patient = await this.patients.one(patientId); // 404 "Patient not found" before the body is looked at
    const parsed = GenerateDocumentInput.safeParse(body);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
    const input = parsed.data;
    const [issuer, sourceFits] = await Promise.all([this.clinic.staffRoles(input.issuedBy), this.sourceFits(input, patientId)]);
    refuse(documentRefusal(input, { issuer, sourceFits, patient }));
    return runInTransaction(this.prisma, async (tx) => {
      const row = await tx.patientDocument.create({
        data: { ...clinicData(), ...documentData(input), patientId, title: documentTitle(input, patient), createdAt: this.clock.now() },
        select: DOCUMENT_SELECT,
      });
      await this.audit.record("export", "Document", patientId, tx);
      return toDocument(row);
    });
  }

  /** The mock's sourceFits: the right kind of record, this child's, in a state a document can come from. */
  private async sourceFits(d: GenerateDocumentInput, patientId: string): Promise<boolean> {
    if (!d.sourceId) return !DOCUMENT_SOURCE[d.type];
    switch (DOCUMENT_SOURCE[d.type]?.kind) {
      case "visit": {
        const visit = await this.visits.one(this.prisma, d.sourceId);
        return visit?.patientId === patientId && visit.status === "completed";
      }
      case "payment": // a transfer of credit has no receipt (isMoneyIn)
        return (await this.billing.paymentsOf(patientId)).some((p) => p.id === d.sourceId && isMoneyIn(p));
      case "note": {
        const procedure = await this.notes.signedProcedure(d.sourceId, patientId);
        return !!procedure && !!NOTE_MESSAGES[procedure]; // a procedure with care instructions
      }
      default:
        return true; // a type with no source keeps sourceId as given, unchecked (the mock)
    }
  }
}
```

`visits.one(tx, id)` takes a `Tx`. Passing `this.prisma` works where the root client is assignable to `Tx`
(`billing-records.service.ts:25` defaults `db: Tx = this.prisma`). If TypeScript disagrees, use `visits.patientOf`
plus a status read added to `VisitsService`, not a cast.

```ts
// apps/api/src/documents/documents.controller.ts (new)
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { DocumentsService } from "./documents.service";

/** features/documents/mocks.ts. documents.issue for all three; POST is an export, so a read-only session may issue (exportRead). */
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("documents")
  log() {
    return this.documents.log();
  }

  @Get("patients/:id/documents")
  forPatient(@Param("id") id: string) {
    return this.documents.forPatient(id);
  }

  // Body parsed after the 404 (CONVENTIONS → Traps: the mock's order). 201, as the mock.
  @Post("patients/:id/documents")
  issue(@Param("id") id: string, @Body() body: unknown) {
    return this.documents.issue(id, body);
  }
}
```

```ts
// apps/api/src/documents/documents.module.ts (new)
/** B10: the issued-documents log. A leaf: it reads through five owners and nothing imports it. */
@Module({
  imports: [AuditModule, PatientsModule, VisitsModule, NotesModule, BillingRecordsModule, ClinicModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
```

Add `DocumentsModule` to `AppModule.forRoot`, and add the three document rows to `B10_ROUTES` in
`test/clinical-routes.test.ts` (Step 6.2). `ClinicModule` exports `ClinicService`, and `NotesModule` exports
`NotesService`. Check that `BillingRecordsModule` exports `BillingRecordsService` (it does:
`billing-records.module.ts:5`).

#### Step 7.3: Documents on MySQL

**File:** `apps/api/test/int/documents.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/documents.int.test.ts`

The mock's five cases, the order, a refused document writes nothing, receipts from API payments, another clinic's
records. These are ports of `handlers.test.ts` `describe("documents")` (the root CONVENTIONS rule: "Ported" means the
handler tests pass against the API). Use the seed's ids: Bea Mendoza's completed visit and signed notes, and a seeded
payment. Make new records through the API's own routes (register, start and complete a visit, write and sign an
extraction note, bill and pay with an `Idempotency-Key`).

1. **A notes report by front desk** logs, with the title "Clinical notes report · Bea Mendoza", and leads both the
   child's list and `/documents`.
2. **A certificate and a receipt** on one child: both are listed for the child, and the receipt is in `/documents`.
   The receipt is from a payment made through `POST /invoices/:id/payments` in this test. **This closes B8's
   "receipts as documents" gap.**
3. **Refusals** (each words-exact, in order):
   - A front-desk certificate gives 400 "A dentist has to issue the dental certificate".
   - Another child's payment gives 400 "Pick the payment for this patient".
   - A post-op from a visit id, or from an unsigned note, gives 400 "Pick the signed treatment note for this patient".
   - A post-op from a signed extraction note gives 201 with its `sourceId`.
   - An unknown issuer gives 400 "Unknown staff member", and so does Ngiti's dentist's id: another clinic's staff is
     unknown here.
   - An unknown child gives 404 "Patient not found", before any body check (send an invalid body to prove the order).
4. **Dental clearance** only through a dentist, and only from this child's visit.
5. **Prescriptions:** an S2 drug gives 400 issues (schema). Amoxicillin for a child with a recorded penicillin allergy
   gives 409 with the mock's words. Paracetamol gives 201 with `items[0].drugId`.
6. **A refused document writes nothing:** no row and no audit entry after each refusal above (count before and after).
   A 201 writes one "Document" `export` entry.
7. **Read-only session** (B4's `exportRead`): a session marked `readOnly` may still issue a document (201), and still
   can't upload a photo (403).
8. **Isolation:** Ngiti's Owner gets 404 on a Bulilit child's documents POST. Ngiti's `/documents` contains no
   Bulilit id.
9. **The seed's documents** (`doc_seed_*`) list for the example child in the API, with the seed's ids.
10. **Append-only:** `prisma.patientDocument.update` in context throws the append-only refusal.

#### Phase 7 — Potential Issues

- **Issuer lookup includes deactivated staff** (the mock's `db.staff`). A document issued in a deactivated dentist's
  name passes. That is the demo's behaviour. Restricting it to active staff would be a product change (Question 5).
- **`sourceId` on a type without a source** is stored unchecked, as the mock. A 192+ character id answers 500 and
  writes nothing, the same accepted gap as B6 decision 9. `details` values are unbounded strings in a JSON column, so
  there is no length failure.
- **`GET /documents` take 100 with no paging**, as the mock. It grows without bound in the database, but the page
  never shows more than 100. Cursor paging goes in shared and the mock first (CONVENTIONS → Data). Recorded in Issues.
- **Parallel reads in `issue`:** `Promise.all` runs two queries on the root client outside any transaction, which is
  fine. The insert and the audit share one transaction.
- **Module graph:** `DocumentsModule` imports `ClinicModule` (which imports `AuthModule`, `StorageModule` …) and
  `NotesModule` (which imports `PatientsModule`, `VisitsModule` …). It is a leaf, so it can't close a cycle. Nest
  resolves the shared modules once.
- **Cross-cutting registration:** `AppModule`; the 3 routes in `clinical-routes.test.ts`. The access rules already
  exist.
- **New patterns:** none. The rules-as-pure-function pattern is B5's and B8's.

**Issues identified:** `GET /documents` is capped, not paged (Medium; as the mock).

## B10f: Seed and cut-over

### Phase 8: The API seed

#### Step 8.1: Photos, their files and documents in `seedDatabase`

**File:** `apps/api/src/seed/seed-database.ts`, `apps/api/prisma/seed.ts`
**Verify:** `pnpm run typecheck`

An optional `files: FileStorage`; rows always, files when given; `StoredFile` rows for what was written.

```diff
// apps/api/src/seed/seed-database.ts
+import { SEED_FILES, type SeedFileType } from "@pedia/seed";
+import { photoData } from "../photos/photo.rows";
+import { documentData } from "../documents/document.rows";
+import { CONTENT_TYPES, clinicKey, type FileExtension, type FileStorage } from "../storage/storage";
@@
-export async function seedDatabase(prisma: PrismaService, hasher: Hasher, env: Pick<Env, "DEMO_LOGINS">, platform: Platform): Promise<void> {
+/**
+ * `files`: where seeded photo bytes go (prisma/seed.ts passes fileStorageOf(env)). Omitted (most integration tests), the
+ * photo rows are still written and their files aren't: opening one then 404s at the link, which those tests never do.
+ */
+export async function seedDatabase(
+  prisma: PrismaService, hasher: Hasher, env: Pick<Env, "DEMO_LOGINS">, platform: Platform, files?: FileStorage,
+): Promise<void> {
@@ (inside each clinic's requestContext.run, after the B9 messages)
+      // B10: photos with their files, and the issued-documents log, with the seed's ids (MSW's and the API's agree in
+      // `hybrid`). Keys are built here, as StorageService would, because the seed has no request; the ledger (E5) gets a
+      // row per stored file.
+      const EXT: Record<SeedFileType, FileExtension> = { "image/png": "png", "application/pdf": "pdf" };
+      const photos = db.photos.map((p) => {
+        const ext = EXT[p.contentType as SeedFileType];
+        return { photo: p, ext, key: clinicKey(clinicId, "photos", p.id, ext), body: SEED_FILES[p.contentType as SeedFileType] };
+      });
+      if (files) {
+        for (const { key, ext, body } of photos) await files.put(key, Buffer.from(body), { contentType: CONTENT_TYPES[ext], bytes: body.length });
+        await prisma.storedFile.createMany({
+          data: photos.map(({ key, body }) => ({ clinicId, key, area: "photos", bytes: body.length, createdAt: now })),
+        });
+      }
+      await prisma.clinicalPhoto.createMany({
+        data: photos.map(({ photo: p, key, ext, body }) => ({
+          ...photoData(p), id: p.id, clinicId, patientId: p.patientId, contentType: CONTENT_TYPES[ext],
+          uploadedBy: p.uploadedBy ?? "staff", fileKey: key, bytes: body.length, createdAt: new Date(p.createdAt),
+        })),
+      });
+      await prisma.patientDocument.createMany({
+        data: db.documents.map((d) => ({ ...documentData(d), id: d.id, clinicId, patientId: d.patientId, title: d.title, createdAt: new Date(d.createdAt) })),
+      });
```

Hoist B9's `const now = new Date()` above the B10 block, or declare it once. `clinicKey` takes the seed photo id as
the key's name (`photo_seed_1` passes `SEGMENT`), so keys are stable across seeds. `photoData(p)` takes
`UploadPhotoInput` fields, and a `ClinicalPhoto` has them all.

```diff
// apps/api/prisma/seed.ts
+import { fileStorageOf } from "../src/storage/file-storage";
@@
-  await seedDatabase(prisma, new Hasher(), env, seedPlatform());
+  await seedDatabase(prisma, new Hasher(), env, seedPlatform(), fileStorageOf(env)); // the API's own driver: S3 or STORAGE_DIR
```

`db:seed` runs from `apps/api`, so the local driver's `STORAGE_DIR` (`var/storage`) is the one `pnpm dev:api` reads.

#### Step 8.2: The seed on MySQL

**File:** `apps/api/test/int/seed.int.test.ts`

No `Verify:` line (existing file; `test:int` isn't on the allowlist). Run it and record it.

New case: "writes each clinic's photos (with files) and documents with the mock's ids (B10)". Seed with a
`LocalDiskStorage` on a temp directory. Bulilit's `ClinicalPhoto` rows equal `db.photos` through `toPhoto` (ids, order
by `takenOn`/`createdAt`), and `PatientDocument` rows equal `db.documents` through `toDocument`. Each `fileKey`'s bytes
in storage equal `SEED_FILES[type]`. `usedBytes()` in Bulilit's context equals the sum of the seeded files. Ngiti has
none of either. Also add a case that seeds without `files`: the rows are written and no `StoredFile` row exists.

#### Phase 8 — Potential Issues

- **Seeding twice with S3:** `db:seed` refuses a database with accounts, and the keys are stable (`photo_seed_N`), so
  a re-seed into a fresh database overwrites the same S3 objects with the same bytes. That is harmless.
- **The ten `seedDatabase` callers in `test/int`** keep compiling: `files` is optional.
- **Breaking changes:** none; new tables only.
- **Layering:** the seed builds keys with `clinicKey` directly, because it has no request context for
  `StorageService`. That is the same exception the seed already makes for every tenant table (`clinicId` stamped by
  hand).

**Issues identified:** none.

### Phase 9: Cut-over

#### Step 9.1: Serve the routes in `hybrid`

**File:** `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`
**Verify:** `pnpm run check -- passthrough`

6 B10 routes plus `GET /files/:token`; update the B6/B8 comments.

```diff
// apps/web/src/mocks/passthrough.ts
   // B6: notes, growth and the treatment plan (NotesController, GrowthController, PlanController). MSW's
-  // documents still read their own notes and plan items until B10 (B6 decision 2).
+  // documents are the API's too since B10.
@@
   // B8: bills, payments, deposits, credit, voids, the day's collections and the financial dashboard (BillingController,
-  // CollectionsController, ReportsController). Receipts and statements as documents stay on MSW until B10.
+  // CollectionsController, ReportsController). Receipts are logged by the API's documents since B10.
@@
   { method: "POST", path: "/patients/:id/birthday-greeting" },
+  // B10: clinical photos and parents' documents (PhotosController), the issued-documents log (DocumentsController), and
+  // the local storage driver's 5-minute file links (LocalFilesController: API-only, public, signed). A file read
+  // answers a 302 to a link; a new tab opening /api/files/<token> must reach the API, not MSW's gate.
+  { method: "GET", path: "/patients/:id/photos" },
+  { method: "POST", path: "/patients/:id/photos" },
+  { method: "GET", path: "/photos/:id/file" },
+  { method: "GET", path: "/documents" },
+  { method: "GET", path: "/patients/:id/documents" },
+  { method: "POST", path: "/patients/:id/documents" },
+  { method: "GET", path: "/files/:token" },
 ];
```

`passthrough.test.ts`:
- Rename the test to include B10's photos and documents.
- Add `const b10 = [["GET", "/patients/p1/photos"], ["POST", "/patients/p1/photos"], ["GET", "/photos/ph1/file"],
  ["GET", "/documents"], ["GET", "/patients/p1/documents"], ["POST", "/patients/p1/documents"], ["GET",
  "/files/abc.def"]] as const`, assert every one is served, and add `b10.length` to the length check.
- Exact method: `POST /files/x` and `DELETE /photos/ph1` are not served.
- Move `POST /patients/p1/documents`, `GET /documents` and `GET /patients/p1/photos` out of the "still MSW's"
  expectations (lines 74–77). `POST /patients/p1/exports` (B13) and `/clinic/subscription` (B12) stay MSW's.

`/files/:token` has no mock `RULES` entry, deliberately. MSW never makes such links, and `apiPassthrough` runs before
the gate, so in `hybrid` the gate never sees it. In `enabled` mode the API's links never appear.

#### Step 9.2: The browser spec against the API

**File:** `apps/web/e2e/api-photos-documents.spec.ts` (new)
**Verify:** `test -f apps/web/e2e/api-photos-documents.spec.ts`

Upload, open (302 then bytes), Download, the portal, refusals, a document, cross-clinic, a restart. B9's spec shape
(`api-messages.spec.ts:1–60`): skipped unless `E2E_API=1`, serial, `fromApi` by `x-request-id`, `viaApi`, and
`RUN`-suffixed children so it re-runs on one database. Header:

```ts
/**
 * B10: photos and documents against apps/api in `hybrid`. Skipped unless E2E_API=1. Start-up (B10 plan Step 9.2), fresh database:
 *   CREATE DATABASE pedia_dental_e2e_b10; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true STORAGE_DIR=var/e2e-b10 pnpm db:seed
 *   DATABASE_URL=… PORT=4140 DEMO_LOGINS=true COOKIE_SECURE=false STORAGE_DIR=var/e2e-b10 STORAGE_LINK_SECRET=<32+ chars> pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=hybrid API_PROXY_TARGET=http://localhost:4140 pnpm exec next dev --port 3190
 * Local-disk driver (no S3_BUCKET): links are /api/files/<token> through Next's proxy. About 5 sign-ins a run.
 */
```

Tests (dentist unless named). Setup writes go through `page.request` as the signed-in user; every assertion on a file
goes through the UI's own requests.
1. **Seeded photos open.** On the example child's Photos tab, the `GET /patients/:id/photos` is answered by the API.
   The before/after pair of tooth 74 shows. The `<img>` request to `/api/photos/photo_seed_1/file` answers **302**
   (`x-request-id`) and its redirect `/api/files/…` answers 200 `image/png`. Check with `page.waitForResponse` on
   both paths. The image's `naturalWidth` is 1. **This also proves that MSW's passthrough and Next's proxy pass a 302
   through** (Question 6).
2. **Upload through the dialog.** Register `Pic${RUN}` (photos yes). Upload an intraoral JPEG through the Upload
   dialog (the UI's `POST /patients/:id/photos`, 201 from the API). The thumbnail renders through the 302.
3. **A PDF: Open and Download.** Upload a `referral` PDF. `FileCard`'s Open opens a new tab whose URL ends at
   `/api/files/…`. That shows the navigation passed MSW (the `/files/:token` passthrough); without it the tab shows
   MSW's 403. Download triggers a download (`page.waitForEvent("download")`) whose suggested file name ends
   `-referral-<date>.pdf`.
4. **Refusals keep the mock's words in the UI.** Register `NoPic${RUN}` with photos declined. Uploading an intraoral
   shows the 409 words in the dialog. Choosing a `.txt` is caught by the form; send it via `page.request` and expect
   400 "Attach an image file" from the API.
5. **The patient photo.** Set the child's photo from their profile (PUT, 200 from the API). The avatar's `<img>` gets
   a 302, then 200.
6. **Parent portal.** Sign in as the seeded parent. Upload a medical document from the portal (201,
   `uploadedBy: "parent"` in the API's answer). The portal's list shows it and no staff photos.
7. **Documents.** Front desk issues a receipt for a payment made in this run (bill and pay through `page.request`
   with an Idempotency-Key) from the Documents tab. The `POST /patients/:id/documents` is 201 from the API, the PDF
   download fires, and `/documents` (the log page) lists it, read from the API. A dentist's amoxicillin prescription
   for a child with a penicillin allergy shows the 409 words, and no download fires.
8. **Another clinic can't open it.** Sign in as Ngiti's Owner. `page.request.get("/api/photos/<a Bulilit photo
   id>/file")` is 404 "Photo not found" with `x-request-id`.
9. **Survives a restart (manual, recorded):** stop `dev:api` and start it again with the same env. Re-run test 1
   only (`--grep "Seeded photos"`): the photos still open. Record it in the implementation log; the spec can't
   restart a server it doesn't own.

Run the spec twice on one database (desktop) and record both runs. Re-run `api-patients.spec.ts`: its avatar now
loads through a 302.

#### Step 9.3: Record B10 in both CONVENTIONS files and CHUNKS

**File:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`

No `Verify:` line: prose. A reviewer checks each item against the merged code.

- **Root `CONVENTIONS.md`.**
  - Header and Commands: a "Photos and documents against the API" row (the spec, ~5 sign-ins, start-up in its
    header). The `hybrid` list gains "since B10, photos, the documents log and file links". Mock key `v29`.
  - Traps: delete every "until B10" clause: photos on API visits, MSW's documents not seeing API notes, plan items,
    bills and payments. Add: "A file read in `hybrid` is a 302 to a 5-minute link (`/api/files/<token>` locally, S3
    in production); `<img>` and `<a>` follow it. Never `fetch()` a photo or draw it into a canvas without adding CORS
    to the bucket."
  - Reporting rules: "real file storage in the demo" stays a deferral for MSW only. The API stores files since B10.
- **`apps/api/CONVENTIONS.md`.**
  - "Current phase: B1–B10 done".
  - Where things live: `Photos` (`src/photos/`: `PhotosService` the only reader and writer of `ClinicalPhoto`,
    `photo-file.ts`, `photo.rows.ts`) and `Documents` (`src/documents/`: `DocumentsService`, `documents.rules.ts`,
    `document.rows.ts`). File storage: add `S3FileStorage`, `fileStorageOf`, `readUpload`, `sniff`,
    `LocalFilesController`, the `StoredFile` ledger, `link`.
  - Scalability → Side effects: **replace** "Files go to object storage through presigned URLs, never through the
    API's memory" with "Uploads stream through the API to a temp file, are checked, then streamed to object storage;
    never held whole in memory (B10 decision 2). Reads are a 302 to a 5-minute private link."
  - Traps: remove "`LocalDiskStorage` is per instance … needs B10's driver" (now: set `S3_BUCKET` before running a
    second instance). Remove "The patient photo passes through the API's memory". Reword the logo trap: "The logo
    passes through the API's memory (multer, 1 MB) and is served as bytes, because the PDF letterhead draws it into a
    canvas." Remove the two hybrid "until B10" traps.
  - Traps, new:
    - Upload routes read the raw request: no global multipart or raw body parser.
    - Temp disk needs (instances × concurrent uploads × 10 MB) under `os.tmpdir()`.
    - `StorageService` needs `PrismaService` and `Clock` in unit tests.
    - The S3 bucket stays private with no CORS; production needs NTP for presigned URLs.
    - A database seeded before B10 has no photos, documents or ledger rows: use a fresh one. Logos and patient photos
      stored before B10 have no ledger row, so their bytes aren't counted.
  - Decisions recorded, **Storage (B10)**: decisions 1–8 in a line each, plus E1 (spool, check, store), E2 (302 to
    `FILE_LINK_SECONDS`), E4 (bytes decide), E5 (ledger), E6 (consent re-checked under the lock), E8 (three isolation
    layers), E13. Update B1's Storage entry: "Local disk until B10" becomes "local disk or S3 (`S3_BUCKET`)".
- **`CHUNKS.md`.**
  - B10 marked done (date), with its "Decide first" answered by `decisions.md`. **Rewrite B10's first bullet and its
    done-when to decision 2:** "uploads stream through the API, checked, then to S3; reads are 5-minute presigned
    links". Replace "a photo uploads straight to storage" with "a photo is stored in S3 without being held in the
    API's memory".
  - Patch B4's deferred line "the photo through presigned uploads (B10)" to "the photo off multer (B10)".
  - Patch B8's deferred "receipts and statements as documents in `hybrid` (B10)" to done.
  - B12: storage limits read `StorageService.usedBytes()`.

#### Phase 9 — Potential Issues

- **Next's rewrite proxy and redirects:** the plan relies on Next's `/api` rewrite returning the API's 302 to the
  browser rather than following it. Test 1 of the spec proves or disproves it. If Next follows it, the 302 to
  `/api/files/…` still lands at the API through the same proxy and the image still loads, so local mode keeps
  working. For S3, the production web talks to the API directly or through a proxy that passes 3xx; recorded in
  Question 6.
- **MSW in `hybrid`:** `<img>` passthrough is proven since B4 (`GET /patients/:id/photo`). A cross-origin 302 (S3) only
  occurs with `S3_BUCKET` set, which the local spec doesn't exercise. A manual MinIO run checks it (Question 6).
- **Other specs:** `api-patients.spec.ts` (avatar) and `api-billing.spec.ts` (if it downloads a receipt) must be
  re-run.
- **Cross-cutting registration:** `API_ROUTES` is the only switch. Every route also has an API access rule and a
  route-registry test from earlier phases.

**Issues identified:** CHUNKS B10 says "presigned uploads"; decision 2 overrides it (planned, Step 9.3).

## 3. Related Files

| File | Role in B10 |
| --- | --- |
| `.claude/plans/feature-chunk-b10-photos-documents-plan/decisions.md` | The 8 settled decisions |
| `apps/api/CHUNKS.md:325–343` | B10's goal and done-when (bullet 1 and the done-when overridden by decision 2) |
| `apps/web/src/features/photos/{mocks.ts,api.ts}` | The spec for the photo routes, upload order, `photoFileUrl` (`references/photos-mocks-review.ts`) |
| `apps/web/src/features/photos/components/{photos-tab,file-card,upload-photo-dialog}.tsx` | How files are opened (`<img>`, `<a>`), Download |
| `apps/web/src/features/documents/{mocks.ts,api.ts,download.ts}` | The documents spec; the logo drawn into a canvas (`references/documents-mocks-review.ts`) |
| `apps/web/src/features/patients/{mocks.ts:333–360,api.ts:71–124}` | Patient photo spec and its `<img>` URL |
| `apps/web/src/mocks/{blob-store.ts,access.ts:187–189,228–230,passthrough.ts,db.ts}` | Mock files, rules, `API_ROUTES`, db key |
| `apps/web/src/mocks/handlers.test.ts:663–705, 1224–1290` | Handler tests to port |
| `packages/shared/src/{schemas/photo.ts,schemas/document.ts,domain/photos.ts,domain/documents.ts,domain/legal.ts:123,domain/permissions.ts}` | Contract and rules (quoted in Steps 1.1, 6.1 and 7.1; short files, no review) |
| `packages/seed/src/{seed.ts:243–285,platform.ts:57,63}` | Where seeded photos and documents land |
| `apps/api/src/storage/*` | B1-c storage to extend (`references/storage-review.ts`) |
| `apps/api/src/patients/{patient-photo.ts,patients.controller.ts:93–113,patient-writes.service.ts:177–201,patients.service.ts:139–146}` | The patient photo to move off multer (`references/patient-photo-review.ts`) |
| `apps/api/src/clinic/clinic.controller.ts:92–112`, `clinic/logo.ts` | The logo: stays bytes and multer (E3) |
| `apps/api/src/auth/{access-rules.ts,record-owners.ts,access.guard.ts}` | Rules (exist), record owners, public routes |
| `apps/api/src/seed/seed-database.ts`, `prisma/seed.ts` | The API seed |
| `apps/api/src/{visits,notes,billing-records,clinic}/*.service.ts` | Reads documents need |
| `apps/web/e2e/api-messages.spec.ts` | Spec template |
| `.claude/plans/feature-chunk-b9-messages-plan/` | Layout and test strategy template |

## 4. Follow Ups

### Questions / Clarifications

None re-asks `decisions.md`. Each covers a rule the decisions leave open. The recommended answer is in bold, and the
plan is written to it.

1. **Where the stored-bytes count shows** (decision 8 says count, not show). **Recommended: nowhere in B10.**
   `StorageService.usedBytes()` is tested, and B12 adds it to Settings → Usage and the operator console, with plan
   limits. That needs `ClinicUsage` changed in shared and the mock first. The alternative is adding `storedBytes` to
   `GET /clinic/usage` now (shared, mock and API together, about 30 lines).
2. **Files stored before B10** (logos, patient photos on existing databases) have no ledger row. **Recommended: no
   backfill.** Every database so far is a demo database recreated per chunk. Say so if a live database exists that
   needs `db:backfill-stored-files`.
3. **S3 credentials:** **Recommended: an IAM role in production** (no keys in env; the SDK's default chain), with
   static `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` only for R2 or MinIO. That makes the SDK the one reader of
   `process.env` outside `env.ts`. The alternative is to require keys always and keep `env.ts` the only reader.
4. **Bucket setup before go-live** (decisions → Still open). **Recommended:**
   - `ap-southeast-1`, Block Public Access on, default encryption SSE-S3, versioning on (photos are medical records).
   - No CORS rule and no lifecycle expiry.
   - An IAM policy limited to `s3:PutObject`, `GetObject` and `DeleteObject` on `clinics/*`.

   The user sets this up; the plan writes it into `apps/api/CONVENTIONS.md` as go-live notes.
5. **Documents issued in a deactivated dentist's name** pass, as in the demo (`db.staff` includes deactivated
   logins). **Recommended: keep the demo's rule in B10**. Changing it means the mock and the API change together.
6. **Redirects through the proxies.** The web keeps working in `hybrid` only if Next's `/api` rewrite and MSW's
   passthrough hand a 302 to the browser. The e2e spec proves it for the local driver. **Recommended: before go-live,
   one manual run against MinIO** (`S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true`), recorded in the
   implementation log, to see a cross-origin 302 render. The alternative, if a proxy turns out to follow redirects, is
   a `GET /photos/:id/link` JSON route. That is a contract change in shared, the mock and the web; not planned unless
   needed.

### Issues Found

| Phase | Issue | Severity | Status |
| --- | --- | --- | --- |
| — | CHUNKS B10 and `apps/api/CONVENTIONS.md:170` say presigned uploads; decision 2 overrides them | Medium | Planned (Step 9.3) |
| — | The web sends `file` before `meta`, so a direct request-to-S3 pipe would store files the mock's later checks refuse | High | Planned: spool, check, then store (E1) |
| 1 | The mock names every image `.jpg` (a PNG saves with the wrong extension) | Low | Planned (Step 1.1, C3) |
| 1 | `<a download>` is ignored after a cross-origin redirect; Download would open instead of saving | Medium | Planned (`?download=1`, C1) |
| 3 | Request logs carry `/files/<token>` paths (a key, 5-minute bearer; no patient data) | Low | Open: truncate in `loggerParams` if wanted |
| 4 | S3 stream uploads aren't retried by the SDK (non-rewindable body) | Low | Open |
| 5 | `/files/:token` must pass MSW in `hybrid`, or a new tab opening a PDF gets MSW's 403 | High | Planned (Step 9.1) |
| 5 | The logo can't move to links: the PDF letterhead draws it into a canvas (cross-origin taints it) | Medium | Decided: stays bytes (E3) |
| 6 | A consent "no" could land between the check and the insert | High | Planned (E6, race test in Step 6.3) |
| 7 | `GET /documents` is capped at 100, not paged (as the mock) | Medium | Open: cursor paging in shared and the mock first |
| 7 | B8's "receipts as documents in hybrid" gap | Medium | Closed by Phase 7 and Step 9.1 |
| — | Seed had no photos or documents for any clinic | Low | Planned (Phases 2 and 8) |

### Verification notes

- **`pnpm run check -- <filter>` passes when the filter matches no test file** (`--passWithNoTests`). For steps that
  create a test file (1.3, 2.1, 3.2, 4.2, 4.3, 5.1, 6.1, 7.1), the verifier counts the files that ran (as B8 and B9
  did).
- **`test:int` isn't on the check allowlist** (`harness.config.json` declares only `pnpm run check` and
  `pnpm run typecheck`). Integration files are gated by `test -f`. The phase's real gate is
  `pnpm --filter api test:int`, which the implementer runs and records in `implementation-log.md`.
- **Checks: 20 discriminating, 3 `test -f`, 3 unverifiable** (`verify-plan.mjs --lint`, 2026-10-17). No command
  repeats within a phase.
