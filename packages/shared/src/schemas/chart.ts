import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, tooLong } from "./common";
import { ALL_TEETH, SURFACES, commonSurfaces } from "../domain/teeth";

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
  tooth: z.number().int().refine((t) => ALL_TEETH.includes(t), "Use a tooth number like 74 (FDI)"),
  surfaces: z.array(z.enum(SURFACES)), // empty = whole tooth
  condition: ToothCondition,
  note: z.string().optional(),
  recordedBy: Id,
  recordedAt: IsoDateTime,
  supersedes: Id.optional(),
});
export type ChartEntry = z.infer<typeof ChartEntry>;

/** The longest chart note typed (issue 5): a sensible length, well inside the column. */
export const CHART_NOTE_MAX = 2000;
// Issue 29: "Caries · OO" says nothing new, so a surface is picked once. Inputs only: stored entries are read as they are.
const surfacesOnce = (e: { surfaces: string[] }) => new Set(e.surfaces).size === e.surfaces.length;
const SURFACE_TWICE = { message: "A surface is picked twice", path: ["surfaces"] };
const InputNote = z.string().max(CHART_NOTE_MAX, tooLong(CHART_NOTE_MAX, "the note")).optional();

/** What the client sends. The server sets who recorded it and when, from the visit. */
export const CreateChartEntryInput = ChartEntry.pick({
  visitId: true,
  tooth: true,
  surfaces: true,
  condition: true,
  note: true,
  supersedes: true,
})
  .extend({ note: InputNote })
  .refine(surfacesOnce, SURFACE_TWICE)
  .refine((e) => e.surfaces.length === 0 || !WHOLE_TOOTH_CONDITIONS.includes(e.condition), {
  message: "This condition applies to the whole tooth",
  path: ["surfaces"],
});
export type CreateChartEntryInput = z.infer<typeof CreateChartEntryInput>;

/**
 * The same finding on several teeth at once (POST /patients/:id/chart/batch). The server writes one ordinary
 * ChartEntry per tooth, all or none, so deriveChart() and per-tooth history are unchanged. No corrections here:
 * a correction names one entry.
 */
export const CreateChartBatchInput = ChartEntry.pick({ visitId: true, surfaces: true, condition: true, note: true })
  .extend({ note: InputNote, teeth: z.array(ChartEntry.shape.tooth).min(2, "Pick at least two teeth").max(32) })
  .refine(surfacesOnce, SURFACE_TWICE)
  .refine((e) => new Set(e.teeth).size === e.teeth.length, { message: "A tooth is picked twice", path: ["teeth"] })
  .refine((e) => e.surfaces.length === 0 || !WHOLE_TOOTH_CONDITIONS.includes(e.condition), {
    message: "This condition applies to the whole tooth",
    path: ["surfaces"],
  })
  .refine((e) => e.surfaces.every((s) => commonSurfaces(e.teeth).includes(s)), {
    message: "Not every picked tooth has that surface",
    path: ["surfaces"],
  });
export type CreateChartBatchInput = z.infer<typeof CreateChartBatchInput>;
