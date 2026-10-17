import { PrescriptionItem, type GenerateDocumentInput, type PatientDocument } from "@pedia/shared";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";

export const DOCUMENT_SELECT = {
  id: true, clinicId: true, patientId: true, type: true, title: true, sourceId: true, details: true, items: true, issuedBy: true, createdAt: true,
} as const satisfies Prisma.PatientDocumentSelect;
export type DocumentRow = Prisma.PatientDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

/** Contract input → columns. JSON columns hold exactly what GenerateDocumentInput returned. */
export const documentData = ({ type, sourceId, details, items, issuedBy }: GenerateDocumentInput) => ({
  type, sourceId: sourceId ?? null, details: details ?? undefined, items: items ?? undefined, issuedBy,
});

/** Row → PatientDocument; the JSON columns parsed back with the shared shapes, absent ones left out. */
export const toDocument = (r: DocumentRow): PatientDocument => ({
  id: r.id,
  clinicId: r.clinicId,
  patientId: r.patientId,
  type: r.type,
  title: r.title,
  ...(r.sourceId && { sourceId: r.sourceId }),
  ...(r.details != null && { details: z.record(z.string(), z.string()).parse(r.details) }),
  ...(r.items != null && { items: PrescriptionItem.array().parse(r.items) }),
  issuedBy: r.issuedBy,
  createdAt: r.createdAt.toISOString(),
});
