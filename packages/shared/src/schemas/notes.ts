import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";

const fieldBase = { key: z.string(), label: z.string(), required: z.boolean().optional() };

/** Note templates are data, so a new procedure template needs no code change. */
export const TemplateField = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), ...fieldBase, multiline: z.boolean().optional() }),
  z.object({ type: z.literal("select"), ...fieldBase, options: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("checkbox"), ...fieldBase }),
  z.object({ type: z.literal("teeth"), ...fieldBase }),
]);
export type TemplateField = z.infer<typeof TemplateField>;

export const NoteTemplate = z.object({
  id: Id,
  name: z.string(), // "Pulpotomy", "Extraction"…
  procedure: z.string(), // a Procedure.code; links to follow-up rules and plan items
  fields: z.array(TemplateField),
});
export type NoteTemplate = z.infer<typeof NoteTemplate>;

export const BehaviorRating = z.enum([
  "cooperative",
  "anxious",
  "fearful",
  "crying",
  "resistant",
  "needs_parent",
  "needs_guidance",
]);
export type BehaviorRating = z.infer<typeof BehaviorRating>;

export const ClinicalNote = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id,
  templateId: Id,
  values: z.record(z.string(), z.unknown()), // checked against the template by noteValuesSchema()
  behavior: z.array(BehaviorRating),
  behaviorNote: z.string().optional(),
  authorId: Id,
  createdAt: IsoDateTime,
  signedAt: IsoDateTime.optional(), // signed notes are locked
});
export type ClinicalNote = z.infer<typeof ClinicalNote>;

export const UpdateNoteInput = ClinicalNote.pick({ values: true, behavior: true, behaviorNote: true });
export type UpdateNoteInput = z.infer<typeof UpdateNoteInput>;

export const CreateNoteInput = UpdateNoteInput.extend(ClinicalNote.pick({ visitId: true, templateId: true }).shape);
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;
