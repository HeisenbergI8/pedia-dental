import { format } from "date-fns";

/** Set it in localStorage and reload to see grace and the pause without waiting days (S1). Reset demo data keeps it. */
export const DEMO_TODAY_KEY = "pedia-dental:demo-today";
let pinned: string | null = null;

/**
 * The mock backend's "today" as `yyyy-MM-dd`: what every due date, grace period and automatic pause is measured
 * against. A test's `setToday`, else the demo override, else the real local date. NestJS: the server's date in Manila.
 */
export function today(): string {
  if (pinned) return pinned;
  if (typeof window !== "undefined") {
    try {
      const demo = window.localStorage.getItem(DEMO_TODAY_KEY);
      if (demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)) return demo;
    } catch {
      // storage blocked: the real date
    }
  }
  return format(new Date(), "yyyy-MM-dd");
}

/** Tests only: pins today. `null` goes back to the real date. */
export function setToday(day: string | null) {
  pinned = day;
}
