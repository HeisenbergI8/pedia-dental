// apps/api/src/patients/{patient-photo.ts, patients.controller.ts:93-113, patient-writes.service.ts:177-201, patients.service.ts:139-146}
// The B4 patient photo: multer memory storage in, bytes out. B10 moves it to readUpload and a 302 link.

// patients.controller.ts
//   @Put("patients/:id/photo") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
//   @UseFilters(PhotoTooLarge)
//   IMPORTANT multer buffers up to 10 MB in memory: what decision 2 forbids.
//   @Get("patients/:id/photo") returns StreamableFile(found.file.body), inline filename + nosniff. NOTE becomes a 302 (E2).

// patient-photo.ts
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Images must be under 10 MB";
export const NOT_AN_IMAGE = "Attach an image file";
// cleanPhoto(file): no file or not image/* → 400; size > max → 413; SIGNATURES (jpg/png/webp) on the buffer, else 400.
// NOTE SIGNATURES move to storage/sniff.ts (plus pdf); cleanPhoto then reads SpooledFile.head.

// patient-writes.service.ts
//   uploadPhoto: patients.one(id) (404 first) → cleanPhoto → storage.put("patients", ext, body) → swapPhoto
//   swapPhoto: runInTransaction → lockPatient → update photoRef/photoUpdatedAt → enqueue storage.delete(old) → audit
// IMPORTANT "Stored before the transaction": slow work first; kept with putFile.

// patients.service.ts
//   photo(id): select photoRef + names → storage.get(photoRef) → audit view "Patient photo" → { file, name }
// NOTE becomes photoLink(id): storage.link(...); the bytes' existence is no longer checked (Phase 5 issue).
