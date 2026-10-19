import { addYears, format, max, parseISO } from "date-fns";

/** A child's record is kept until the LATER of these two (B13c2b-2 decisions.md D1). Whole years. */
export type RetentionPeriods = { yearsAfterLastVisit: number | null; untilAge: number | null };

/**
 * CONFIRM WITH COUNSEL (B13c2 C1, C3): how long a child's health record is kept. Both are null until counsel gives the
 * periods; while either is null `retentionEndsOn` answers undefined, so nothing is ever anonymised, and the API refuses
 * to start with RETENTION_ERASURE=true (env.ts). Setting them is a reviewed change to this line and its test.
 */
export const RECORD_RETENTION: RetentionPeriods = { yearsAfterLastVisit: null, untilAge: null };

/** What an anonymised record shows where a name or required text was (D4). A leaf constant, so no API file imports a service for it. */
export const ANONYMISED = "Anonymised";

export function retentionConfirmed(periods: RetentionPeriods): periods is { yearsAfterLastVisit: number; untilAge: number } {
  return periods.yearsAfterLastVisit !== null && periods.untilAge !== null;
}

const isoDay = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * The day a child's record stops being kept (yyyy-MM-dd): the later of the last activity plus `yearsAfterLastVisit`
 * and the birth date plus `untilAge` years. `lastActivityOn` is the last visit, or the day the record was made when
 * there was none. undefined while the periods are unconfirmed.
 */
export function retentionEndsOn(child: { birthDate: string; lastActivityOn: string }, periods: RetentionPeriods): string | undefined {
  if (!retentionConfirmed(periods)) return undefined;
  return isoDay(max([addYears(parseISO(child.lastActivityOn), periods.yearsAfterLastVisit), addYears(parseISO(child.birthDate), periods.untilAge)]));
}

/** True only from the day AFTER the end (conservative by a day), and never while the periods are unconfirmed. */
export function retentionEnded(child: { birthDate: string; lastActivityOn: string }, periods: RetentionPeriods, today: string): boolean {
  const ends = retentionEndsOn(child, periods);
  return ends !== undefined && ends < today;
}
