import { financeWindow, unpaidSince, type FinanceFacts } from "@pedia/shared";
import { addDays, format, parseISO, startOfMonth } from "date-fns";

/** A Manila day's start as a UTC "yyyy-MM-dd HH:mm:ss" string: raw SQL bounds never go through Date serialisation (E7). */
export const manilaStartUtc = (day: string) => new Date(`${day}T00:00:00+08:00`).toISOString().slice(0, 19).replace("T", " ");
export const nextDay = (day: string) => format(addDays(parseISO(day), 1), "yyyy-MM-dd");

/** Every bound the queries use, from the shared windows, so SQL reads exactly the days the summary reads. */
export function financeBounds(today: string) {
  const window = financeWindow(today);
  return {
    collectedFrom: manilaStartUtc(window.from),
    /** The latest bucket's end: a past day's month and week bars count their whole span (financeWindow). */
    collectedEnd: manilaStartUtc(nextDay(window.to)),
    monthFrom: manilaStartUtc(format(startOfMonth(parseISO(today)), "yyyy-MM-dd")),
    unpaidFrom: manilaStartUtc(unpaidSince(today)),
    end: manilaStartUtc(nextDay(today)),
  };
}

/** Raw rows (DECIMAL sums arrive as strings, COUNT as bigint) → facts. */
export const toCollected = (rows: { day: string; method: string; amount: unknown }[]): FinanceFacts["collected"] =>
  rows.map((r) => ({ day: r.day, method: r.method as FinanceFacts["collected"][number]["method"], amount: Number(r.amount) }));
