import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, pastIsoDate, tooLong } from "./common";

export const OralHabit = z.enum(["thumb_sucking", "pacifier", "mouth_breathing", "bruxism"]);
export type OralHabit = z.infer<typeof OralHabit>;

/** Habit dates are what the parent reports, so they can't be later than today. */
const PastDate = pastIsoDate("Enter a date", "Can't be in the future");

/** The longest speech note typed (issue 5): a sensible length, well inside the column. */
export const SPEECH_MAX = 2000;

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

export const SaveGrowthInput = GrowthRecord.pick({ habits: true, speech: true })
  .extend({ speech: z.string().max(SPEECH_MAX, tooLong(SPEECH_MAX, "the speech notes")).optional() })
  .refine(
  (r) => new Set(r.habits.map((h) => h.habit)).size === r.habits.length,
  { message: "Each habit once", path: ["habits"] },
);
export type SaveGrowthInput = z.infer<typeof SaveGrowthInput>;
