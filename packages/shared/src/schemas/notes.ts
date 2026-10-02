import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";

/** Note templates are data, so a new procedure template needs no code change. */
export const TemplateField = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), key: z.string(), label: z.string(), multiline: z.boolean().optional() }),
  z.object({ type: z.literal("select"), key: z.string(), label: z.string(), options: z.array(z.string()) }),
  z.object({ type: z.literal("checkbox"), key: z.string(), label: z.string() }),
  z.object({ type: z.literal("teeth"), key: z.string(), label: z.string() }),
]);

export const NoteTemplate = z.object({
  id: Id,
  name: z.string(), // "Pulpotomy", "Extraction"…
  procedure: z.string(), // links to follow-up rules
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

export const ClinicalNote = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id,
  templateId: Id,
  values: z.record(z.string(), z.unknown()),
  behavior: z.array(BehaviorRating),
  authorId: Id,
  signedAt: IsoDateTime.optional(), // signed notes are locked
});
export type ClinicalNote = z.infer<typeof ClinicalNote>;
