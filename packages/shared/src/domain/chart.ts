import type { ChartEntry, ToothCondition } from "../schemas/chart";
import type { Surface, ToothNumber } from "./teeth";

export type ToothState = {
  tooth: ToothNumber;
  /** Latest condition for the whole tooth, if any. */
  whole?: ToothCondition;
  /** Latest condition per surface. */
  surfaces: Partial<Record<Surface, ToothCondition>>;
  history: ChartEntry[];
};

/** Derive the current chart from the append-only entries. */
export function deriveChart(entries: ChartEntry[]): Map<ToothNumber, ToothState> {
  const superseded = new Set(entries.map((e) => e.supersedes).filter(Boolean));
  const sorted = [...entries].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const chart = new Map<ToothNumber, ToothState>();

  for (const e of sorted) {
    const state = chart.get(e.tooth) ?? { tooth: e.tooth, surfaces: {}, history: [] };
    state.history.push(e);
    if (!superseded.has(e.id)) {
      if (e.surfaces.length === 0) {
        state.whole = e.condition;
        state.surfaces = {}; // a whole-tooth finding (e.g. extracted) resets surface detail
      } else {
        for (const s of e.surfaces) state.surfaces[s] = e.condition;
      }
    }
    chart.set(e.tooth, state);
  }
  return chart;
}
