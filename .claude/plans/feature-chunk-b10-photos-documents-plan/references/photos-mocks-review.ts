// apps/web/src/features/photos/{mocks.ts,api.ts} + components: the spec for B10's photo routes (as of 2026-10-17).

// POST /patients/:id/photos (mocks.ts:26-73), the order the API keeps:
//   404 "Patient not found" → 400 "Attach a file" → 400 "`meta` must be JSON" → 400 Zod issues
//   → uploadProblem(type, file), status = file.size > max ? 413 : 400
//     NOTE 413 even when the named problem is the type (kept by photoFileProblem)
//   → 409 "<first>'s family declined clinical photos. …" (CONSENTED_PHOTO_TYPES = intraoral, extraoral)
//   → 400 "Upload a photo or a medical document" (fromParent = !rolesCan(roles, "clinical.write"); no visit/stage/tooth)
//   → 400 "Visit not found" → 201 { ...meta, id, clinicId, patientId, contentType, uploadedBy, createdAt }
// GET /patients/:id/photos (15-23): newest takenOn, then createdAt; without clinical.view only uploadedBy "parent".
// GET /photos/:id/file (75-91): 404 "Photo not found" for an unknown id, or a staff photo without clinical.view;
//   inline; filename = [last, first, type, tooth, takenOn].join("-") + (pdf ? ".pdf" : ".jpg")

// api.ts:28-31  IMPORTANT the client sets "file" BEFORE "meta". A server streaming straight to S3 would store files
//   before it can read meta (consent, parent, visit), which is why E1 spools to a temp file first.
// api.ts:14  photoFileUrl(id) is used only as <img src> and <a href> (photos-tab.tsx:46,54,56,165-167; file-card.tsx:7-14).
//   NOTE <img>/<a> follow a 302 without CORS, so reads need no web change; <a download> needs ?download=1 (C1).
