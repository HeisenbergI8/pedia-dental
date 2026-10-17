// apps/web/src/features/documents/{mocks.ts,download.ts}: the documents spec, and why the logo stays bytes.

// POST /patients/:id/documents (mocks.ts:47-76), in order:
//   404 "Patient not found" → 400 Zod issues (GenerateDocumentInput) → 400 "Unknown staff member" (db.staff, deactivated included)
//   → 400 "A dentist has to issue the <label lowercased>" (DENTIST_SIGNED, holdsRole dentist)
//   → 400 "<DOCUMENT_SOURCE.missing> for this patient" (sourceFits: completed visit / isMoneyIn payment /
//     signed note whose procedure has NOTE_MESSAGES; types without a source: true)
//   → 409 "<first> is allergic to <drugs> (recorded: <allergies>)" → 201, title "<label> · <first> <last>"
// GET /documents: newest first, slice(0, 100). GET /patients/:id/documents: newest first.

// download.ts:9-23  pdfLogo(): new Image(src = logoUrl) → canvas.drawImage → toDataURL
// IMPORTANT a cross-origin redirect (S3) would taint the canvas: GET /clinic/logo keeps serving bytes (E3).
