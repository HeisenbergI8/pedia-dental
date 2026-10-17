# Decisions: B10 — photos and documents

Settled with the user on 2026-10-17. The architect plans against these and does not re-ask them.

1. **Storage**: Amazon S3 in Singapore (ap-southeast-1) in production; an S3-compatible driver (R2 possible later by config). Development and tests keep the local-disk driver.
2. **Uploads travel through the API**: the server checks the file (size, type), then streams it to storage; never buffered whole in memory. The upload contract and screens stay as the demo's. Browser-to-storage presigned uploads only if volume ever needs it.
3. **Opening a file**: a private link valid for 5 minutes; one clinic can never open another clinic's file, even with its key.
4. **Limits**: as the demo — 10 MB max, images only, PDFs only for "document" and "referral".
5. **No delete**: photos are part of the medical record and stay undeletable, as the demo.
6. **Documents**: PDFs stay built in the browser; the server keeps only the issued-document log (with the demo's checks: issuer, source, allergy). No PDF files stored. A refused document produces no file by construction.
7. **Parent uploads**: from the portal as the demo — intraoral, extraoral and medical documents (no X-rays); blocked when the family declined clinical photos.
8. **Storage use**: count each clinic's stored bytes; no limit in B10 (limits come with plans in B12).

## Out of scope

- Presigned browser-to-storage uploads.
- Deleting photos.
- Server-side PDF generation or stored PDF files.
- Enforcing a storage limit (B12).

## Still open

- The production S3 bucket and credentials: set up by the user before go-live.
