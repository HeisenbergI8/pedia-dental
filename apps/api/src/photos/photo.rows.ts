import type { ClinicalPhoto, UploadPhotoInput } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** The columns a response needs; `fileKey` and `bytes` stay inside the API. */
export const PHOTO_SELECT = {
  id: true, clinicId: true, patientId: true, visitId: true, type: true, stage: true, tooth: true, takenOn: true,
  caption: true, contentType: true, uploadedBy: true, createdAt: true,
} as const satisfies Prisma.ClinicalPhotoSelect;
export type PhotoRow = Prisma.ClinicalPhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Contract input → row columns. `takenOn` is a calendar date (@db.Date), as Visit.date. */
export const photoData = ({ visitId, type, stage, tooth, takenOn, caption }: UploadPhotoInput) => ({
  visitId: visitId ?? null, type, stage: stage ?? null, tooth: tooth ?? null, takenOn: dateOnly(takenOn), caption,
});

/** Row → ClinicalPhoto. Absent optionals are left out, not null (the contract's `.optional()`). */
export const toPhoto = (r: PhotoRow): ClinicalPhoto => ({
  id: r.id,
  clinicId: r.clinicId,
  patientId: r.patientId,
  ...(r.visitId && { visitId: r.visitId }),
  type: r.type,
  ...(r.stage && { stage: r.stage }),
  ...(r.tooth !== null && { tooth: r.tooth }),
  takenOn: r.takenOn.toISOString().slice(0, 10),
  caption: r.caption,
  contentType: r.contentType,
  uploadedBy: r.uploadedBy,
  createdAt: r.createdAt.toISOString(),
});
