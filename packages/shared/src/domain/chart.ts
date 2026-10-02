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

/**
 * Derive the current chart from the append-only entries. A correction is applied at the moment of the
 * entry it supersedes, so correcting an old finding never overrides what later visits recorded.
 */
export function deriveChart(entries: ChartEntry[]): Map<ToothNumber, ToothState> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const superseded = new Set(entries.map((e) => e.supersedes).filter(Boolean));
  const appliesAt = (e: ChartEntry): string => {
    const original = e.supersedes && byId.get(e.supersedes);
    return original ? appliesAt(original) : e.recordedAt;
  };
  const byRecordedAt = (a: ChartEntry, b: ChartEntry) => a.recordedAt.localeCompare(b.recordedAt);
  const chart = new Map<ToothNumber, ToothState>();
  const stateOf = (t: ToothNumber) => {
    const state = chart.get(t) ?? { tooth: t, surfaces: {}, history: [] };
    chart.set(t, state);
    return state;
  };

  for (const e of [...entries].sort(byRecordedAt)) stateOf(e.tooth).history.push(e);

  const live = entries.filter((e) => !superseded.has(e.id));
  live.sort((a, b) => appliesAt(a).localeCompare(appliesAt(b)) || byRecordedAt(a, b));
  for (const e of live) {
    const state = stateOf(e.tooth);
    if (e.surfaces.length === 0) {
      state.whole = e.condition;
      state.surfaces = {}; // a whole-tooth finding (e.g. extracted) resets surface detail
    } else {
      for (const s of e.surfaces) state.surfaces[s] = e.condition;
    }
  }
  return chart;
}

/** An extracted or missing tooth takes no new findings; a mistaken entry is fixed by correcting it. */
export function isToothGone(state?: ToothState): boolean {
  return state?.whole === "extracted" || state?.whole === "missing";
}
