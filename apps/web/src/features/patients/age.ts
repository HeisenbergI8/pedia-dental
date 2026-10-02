import { differenceInMonths, parseISO } from "date-fns";

/** "6 y 3 m" — pediatric records need months, not just years. */
export function formatAge(birthDate: string, today = new Date()): string {
  const months = differenceInMonths(today, parseISO(birthDate));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y} y ${m} m` : `${m} m`;
}
