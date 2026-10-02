import type { GrowthRecord, OralHabit } from "../schemas/growth";
import type { ToothState } from "./chart";
import { dentitionOf, type ToothNumber } from "./teeth";

export type HabitHistory = {
  habit: OralHabit;
  startedOn?: string;
  stoppedOn?: string;
  /** Visits at which the habit was recorded, oldest first. */
  visitIds: string[];
};

/**
 * One line per habit across all visits. A later record's dates win, but a start date recorded once
 * isn't lost when a later visit only adds the stop date.
 */
export function habitTimeline(records: GrowthRecord[]): HabitHistory[] {
  const byHabit = new Map<OralHabit, HabitHistory>();
  for (const r of [...records].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    for (const h of r.habits) {
      const prev = byHabit.get(h.habit) ?? { habit: h.habit, visitIds: [] };
      byHabit.set(h.habit, {
        habit: h.habit,
        startedOn: h.startedOn ?? prev.startedOn,
        stoppedOn: h.stoppedOn,
        visitIds: [...prev.visitIds, r.visitId],
      });
    }
  }
  return [...byHabit.values()];
}

const NOT_IN_MOUTH = ["extracted", "missing", "unerupted"];

export type DentitionStage = {
  stage?: "primary" | "mixed" | "permanent"; // unset until the chart records a tooth in the mouth
  erupting: ToothNumber[];
  unerupted: ToothNumber[];
  /** Primary teeth recorded as extracted or missing (exfoliated or removed). */
  primaryLost: ToothNumber[];
};

/** Dentition stage and eruption status, read from the derived chart. Uncharted teeth are not guessed. */
export function dentitionStage(chart: Map<ToothNumber, ToothState>): DentitionStage {
  const teeth = [...chart.values()];
  const inMouth = teeth.filter((t) => !NOT_IN_MOUTH.includes(t.whole ?? ""));
  const primary = inMouth.some((t) => dentitionOf(t.tooth) === "primary");
  const permanent = inMouth.some((t) => dentitionOf(t.tooth) === "permanent");
  const sorted = (f: (t: ToothState) => boolean) => teeth.filter(f).map((t) => t.tooth).sort((a, b) => a - b);
  return {
    stage: primary && permanent ? "mixed" : primary ? "primary" : permanent ? "permanent" : undefined,
    erupting: sorted((t) => t.whole === "erupting"),
    unerupted: sorted((t) => t.whole === "unerupted"),
    primaryLost: sorted((t) => dentitionOf(t.tooth) === "primary" && ["extracted", "missing"].includes(t.whole ?? "")),
  };
}
