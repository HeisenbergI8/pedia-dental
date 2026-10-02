import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";
import { ALL_TEETH, SURFACES } from "../domain/teeth";

export const ToothCondition = z.enum([
  "sound",
  "caries",
  "restored",
  "sealant",
  "fluoride",
  "pulpotomy",
  "pulpectomy",
  "extracted",
  "missing",
  "unerupted",
  "erupting",
]);
export type ToothCondition = z.infer<typeof ToothCondition>;

/** Conditions of the whole tooth; they never apply to a single surface. */
export const WHOLE_TOOTH_CONDITIONS: ToothCondition[] = [
  "pulpotomy",
  "pulpectomy",
  "extracted",
  "missing",
  "unerupted",
  "erupting",
];

/**
 * Chart entries are append-only. The current chart is derived from them
 * (see domain/chart.ts). Corrections are new entries with `supersedes`.
 */
export const ChartEntry = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id,
  tooth: z.number().int().refine((t) => ALL_TEETH.includes(t), "Invalid FDI tooth"),
  surfaces: z.array(z.enum(SURFACES)), // empty = whole tooth
  condition: ToothCondition,
  note: z.string().optional(),
  recordedBy: Id,
  recordedAt: IsoDateTime,
  supersedes: Id.optional(),
});
export type ChartEntry = z.infer<typeof ChartEntry>;

/** What the client sends. The server sets who recorded it and when, from the visit. */
export const CreateChartEntryInput = ChartEntry.pick({
  visitId: true,
  tooth: true,
  surfaces: true,
  condition: true,
  note: true,
  supersedes: true,
}).refine((e) => e.surfaces.length === 0 || !WHOLE_TOOTH_CONDITIONS.includes(e.condition), {
  message: "This condition applies to the whole tooth",
  path: ["surfaces"],
});
export type CreateChartEntryInput = z.infer<typeof CreateChartEntryInput>;
