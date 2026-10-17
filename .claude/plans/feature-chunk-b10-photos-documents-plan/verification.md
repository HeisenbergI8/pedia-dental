# Verification: B10 (photos and documents)

**Status:** not run. The tester and the auditor fill in the Evidence column and append their findings below.

## Checks to run

| Check | Expected | Evidence |
| --- | --- | --- |
| `pnpm run check` | Exit 0. Count the files that ran (`--passWithNoTests` hides a missing file). New files: `file-url.test.ts`, `local-links.test.ts`, `s3.storage.test.ts`, `file-storage.test.ts`, `multipart.test.ts`, `photo-file.test.ts`, `documents.rules.test.ts`. New cases in `photos.test.ts` (shared), `seed.test.ts`, `handlers.test.ts` "photos", `tenant-scope.test.ts`, `storage.test.ts`, `env.test.ts`, `patient-photo.test.ts`, `access-rules.test.ts`, `clinical-routes.test.ts`, `passthrough.test.ts` | |
| `pnpm --filter api test:int` | Exit 0 for every file | |
| `node .claude/harness/verify-plan.mjs <plan> --strict` | Exit 0 | |
| Done-when 1: a photo is stored without passing through the API's memory and survives a restart | `photos.int` case 9. Memory: `readUpload` holds one chunk (review `multipart.ts`; there is no `Buffer.concat` of the file). e2e restart re-run | |
| Done-when 2: one clinic can't read another's file, even with its key | `photos.int` case 8: all three layers (row 404, `link` undefined, tampered token 404); e2e test 8 | |
| Done-when 3: a refused document produces no file | `documents.int` case 6 (no row, no audit). The browser builds the PDF only after a 201: e2e test 7 sees no download on 409 | |
| Refusal order and words (photos, patient photo, documents) | Each refusal reached once, in the mock's order, exact text | |
| Bytes decide (E4) | SVG or GIF behind an image claim is 400; a PNG behind a JPEG claim is stored as `image/png` | |
| Consent race (E6) | `photos.int` case 7: 409, no row, file deleted through the outbox | |
| 5-minute links | `Cache-Control: no-store` on the 302; S3 `X-Amz-Expires=300`; the local token is 404 at 301 s | |
| Stored bytes | `usedBytes` per clinic equals the ledger sum; a refusal adds 0; delete subtracts | |
| No temp files left | `primolar-uploads` holds nothing the tests created | |
| Access matrix: 7 routes × {anon, parent own/other, front desk, dentist, admin, Bulilit Owner, Ngiti Owner} | As the rules: front desk can't upload (403); parents only their own child's photos and their own uploads | |
| No patient data in logs | Upload and open lines carry ids and paths only. Grep a run's log for a seeded child's name: no hits | |
| Playwright `e2e/api-photos-documents.spec.ts`, desktop, fresh database, twice | Green both runs; the 302 then 200 seen | |
| `api-patients.spec.ts` re-run | Green (the avatar loads through a 302) | |

## Mutation checklist (each must turn the named test red; revert with `git checkout` after each)

| Mutation | Expected red |
| --- | --- |
| Remove the consent re-check inside the upload transaction | `photos.int` case 7 |
| Drop `own(key)` from `StorageService.link` | `storage.test` "no link for another clinic's key"; `photos.int` case 8 |
| `verifyLink` skips the `exp` check | `local-links.test`; `patient-photo.int` "a link expires" |
| `verifyLink` skips the HMAC compare | `local-links.test` tampered token; `photos.int` case 8 |
| `photoFileProblem` skips `sniff` | `photo-file.test` SVG case; `photos.int` case 4 |
| `readUpload` drops the `fileSize` limit | `multipart.test` too-large case; `photos.int` 413 |
| `documentRefusal` checks the source before the dentist | `documents.rules.test` order case |
| `sourceFits` "payment" drops `isMoneyIn` | `documents.int` (a credit transfer as a receipt source is refused) |
| `StorageService.delete` keeps the ledger row | `storage.test`; `photos.int` case 10 |
| Remove `/files/:token` from `API_ROUTES` | `passthrough.test`; e2e test 3 (new tab 403) |
| Remove `ClinicalPhoto` from `APPEND_ONLY` | `tenant-scope.test` |

## Findings

(Appended by the tester and the auditor.)
