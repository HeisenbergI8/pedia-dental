import { z } from "zod";
import { format } from "date-fns";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";

export const OralHabit = z.enum(["thumb_sucking", "pacifier", "mouth_breathing", "bruxism"]);
export type OralHabit = z.infer<typeof OralHabit>;

/** Habit dates are what the parent reports, so they can't be later than today. */
const PastDate = IsoDate.refine((d) => d <= format(new Date(), "yyyy-MM-dd"), "Can't be in the future");

export const HabitObservation = z
  .object({ habit: OralHabit, startedOn: PastDate.optional(), stoppedOn: PastDate.optional() })
  .refine((h) => !h.startedOn || !h.stoppedOn || h.stoppedOn >= h.startedOn, {
    message: "Stopped before it started",
    path: ["stoppedOn"],
  });
export type HabitObservation = z.infer<typeof HabitObservation>;

/** Growth and development as observed at one visit. One per visit; re-saving replaces it. */
export const GrowthRecord = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  visitId: Id,
  habits: z.array(HabitObservation),
  speech: z.string().optional(), // speech-related observations
  recordedAt: IsoDateTime,
});
export type GrowthRecord = z.infer<typeof GrowthRecord>;

export const SaveGrowthInput = GrowthRecord.pick({ habits: true, speech: true }).refine(
  (r) => new Set(r.habits.map((h) => h.habit)).size === r.habits.length,
  { message: "Each habit once", path: ["habits"] },
);
export type SaveGrowthInput = z.infer<typeof SaveGrowthInput>;
