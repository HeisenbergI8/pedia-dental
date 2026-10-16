import { ClinicalNote } from "@pedia/shared";
import type { ClinicalNote as NoteRow, Prisma } from "../generated/prisma/client.ts";

/** A contract note as its row, for the seed. `clinicId` comes from the context (the caller spreads it). */
export const noteRow = (n: ClinicalNote) => ({
  id: n.id, patientId: n.patientId, visitId: n.visitId, templateId: n.templateId,
  values: n.values as Prisma.InputJsonObject, behavior: n.behavior, behaviorNote: n.behaviorNote ?? null,
  authorId: n.authorId, createdAt: new Date(n.createdAt), signedAt: n.signedAt ? new Date(n.signedAt) : null,
});

/** The columns toNote reads: every select of a served note uses this (CONVENTIONS → `select`). */
export const NOTE_COLUMNS = {
  id: true, clinicId: true, patientId: true, visitId: true, templateId: true, values: true, behavior: true,
  behaviorNote: true, authorId: true, createdAt: true, signedAt: true,
} as const;

/** Newest first, as the mock sorts (notes/mocks.ts:27). `id` breaks a tie so the order is stable between reads. */
export const NOTE_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const;

/** The stored note as the contract's, parsed: an unknown behaviour rating fails here, not in the browser. */
export const toNote = (r: Pick<NoteRow, keyof typeof NOTE_COLUMNS>): ClinicalNote =>
  ClinicalNote.parse({
    id: r.id, clinicId: r.clinicId, patientId: r.patientId, visitId: r.visitId, templateId: r.templateId,
    values: r.values, behavior: r.behavior, ...(r.behaviorNote !== null && { behaviorNote: r.behaviorNote }),
    authorId: r.authorId, createdAt: r.createdAt.toISOString(), ...(r.signedAt && { signedAt: r.signedAt.toISOString() }),
  });
