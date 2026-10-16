import { noteValuesSchema, type ClinicalNote, type NoteTemplate, type ToothNumber, type Visit } from "@pedia/shared";
import type { z } from "zod";
import type { Refusal } from "../common/refusal";

export const NOTE_NOT_FOUND = "Note not found"; // notes/mocks.ts:58, :72
export const VISIT_NOT_FOUND = "Visit not found for this patient"; // notes/mocks.ts:38

/** POST /patients/:id/notes after the body parsed: the visit's checks (notes/mocks.ts:37–39). */
export function startRefusal(visit: Pick<Visit, "status"> | undefined): Refusal | undefined {
  if (!visit) return { status: 404, message: VISIT_NOT_FOUND };
  if (visit.status !== "in_progress") return { status: 409, message: "Notes are started during a visit in progress" };
  return undefined;
}

/** PUT /notes/:id: a signed note is read-only (notes/mocks.ts:59). Checked before the body, as the mock. */
export const editRefusal = (note: Pick<ClinicalNote, "signedAt">): Refusal | undefined =>
  note.signedAt ? { status: 409, message: "A signed note can't be changed" } : undefined;

/** POST /notes/:id/sign: once only (notes/mocks.ts:73). */
export const signRefusal = (note: Pick<ClinicalNote, "signedAt">): Refusal | undefined =>
  note.signedAt ? { status: 409, message: "This note is already signed" } : undefined;

export type CheckedValues = { values: Record<string, unknown> } | { refusal: Refusal } | { issues: z.core.$ZodIssue[] };

/**
 * The mock's checkValues (notes/mocks.ts:10–15): the template's own schema over the values, which drops unknown keys.
 * Issues travel as the 400's body (ZodIssuesException), so api-client.ts words them ("Pick at least one tooth. …").
 */
export function checkValues(template: NoteTemplate | undefined, values: unknown): CheckedValues {
  if (!template) return { refusal: { status: 400, message: "Unknown note template" } };
  const parsed = noteValuesSchema(template).safeParse(values);
  return parsed.success ? { values: parsed.data } : { issues: parsed.error.issues };
}

/** The teeth a signed note completes items for: its `teeth` value when that is a list (notes/mocks.ts:76). */
export const teethOf = (values: Record<string, unknown>): ToothNumber[] =>
  Array.isArray(values.teeth) ? (values.teeth as ToothNumber[]) : [];
