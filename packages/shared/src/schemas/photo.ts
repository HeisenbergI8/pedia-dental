import { z } from "zod";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";
import { ALL_TEETH } from "../domain/teeth";

/** `document`: a medical document photographed by a parent (a clearance, a lab result). */
export const PhotoType = z.enum(["intraoral", "extraoral", "xray", "referral", "document"]);
export type PhotoType = z.infer<typeof PhotoType>;

/** Before and after are a stage, not a type: a "before" shot is still intraoral. */
export const PhotoStage = z.enum(["before", "after"]);
export type PhotoStage = z.infer<typeof PhotoStage>;

/** The file itself is served from `GET /photos/:id/file`. */
export const ClinicalPhoto = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id.optional(),
  type: PhotoType,
  stage: PhotoStage.optional(),
  tooth: z.number().int().refine((t) => ALL_TEETH.includes(t), "Use a tooth number like 74 (FDI)").optional(),
  takenOn: IsoDate,
  caption: z.string(),
  contentType: z.string(),
  /** Set by the server. Absent on photos from before the portal, which were all staff uploads. */
  uploadedBy: z.enum(["staff", "parent"]).optional(),
  createdAt: IsoDateTime,
});
export type ClinicalPhoto = z.infer<typeof ClinicalPhoto>;

/** Sent as the `meta` JSON field of a multipart upload, next to `file`. */
export const UploadPhotoInput = ClinicalPhoto.pick({
  visitId: true,
  type: true,
  stage: true,
  tooth: true,
  takenOn: true,
  caption: true,
});
export type UploadPhotoInput = z.infer<typeof UploadPhotoInput>;
