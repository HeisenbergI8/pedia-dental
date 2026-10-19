import { outsideClinicHours, nextOpenStart, type OpeningHours } from "@pedia/shared";

/**
 * B13c1 E10: the load test's targets (CHUNKS B13: Today, patient list, booking) and what "meets its targets" means.
 * Measured locally on the production bundle against MySQL 8.4 with the 5,000-patient Bulilit (load-data.ts); the
 * deployed run uses the same targets at demo size and records the numbers without failing on them.
 * autocannon reports p97.5, not p95, so the thresholds are on p97.5 and p99.
 */
export const PROFILE = { connections: 10, warmupS: 5, durationS: 30 } as const;

export type Target = {
  name: string;
  method: "GET" | "POST";
  path: string;
  login: "frontdesk" | "owner";
  p97_5Ms: number;
  p99Ms: number;
  minRps?: number;
};

export const TARGETS: readonly Target[] = [
  { name: "Today (Imus)", method: "GET", path: "/api/reports/today", login: "frontdesk", p97_5Ms: 300, p99Ms: 800 },
  { name: "Today (all branches)", method: "GET", path: "/api/reports/today?branch=all", login: "owner", p97_5Ms: 400, p99Ms: 1000 },
  { name: "Patient list", method: "GET", path: "/api/patient-summaries?page=1&pageSize=20&filter=all&sort=name", login: "frontdesk", p97_5Ms: 500, p99Ms: 1200 },
  { name: "Patient list: balance due, by balance", method: "GET", path: "/api/patient-summaries?page=1&pageSize=20&filter=balance_due&sort=balance", login: "frontdesk", p97_5Ms: 500, p99Ms: 1200 },
  { name: "Search", method: "GET", path: "/api/patients?q=ma", login: "frontdesk", p97_5Ms: 300, p99Ms: 800 },
  { name: "Book", method: "POST", path: "/api/appointments", login: "frontdesk", p97_5Ms: 400, p99Ms: 1000, minRps: 20 },
];

/** What a run measured, from autocannon's result (run.ts maps it). */
export type Measured = { requests: number; p97_5: number; p99: number; rps: number; non2xx: number; errors: number };

/** Every way a run missed its target; empty means it met it. A run that served nothing fails too. */
export function misses(t: Target, m: Measured): string[] {
  const out: string[] = [];
  if (m.requests === 0) out.push("no requests completed");
  if (m.errors > 0) out.push(`${m.errors} connection errors or timeouts`);
  if (m.non2xx > 0) out.push(`${m.non2xx} answers that weren't 2xx`);
  if (m.p97_5 > t.p97_5Ms) out.push(`p97.5 ${m.p97_5} ms > ${t.p97_5Ms} ms`);
  if (m.p99 > t.p99Ms) out.push(`p99 ${m.p99} ms > ${t.p99Ms} ms`);
  if (t.minRps !== undefined && m.rps < t.minRps) out.push(`${m.rps.toFixed(1)} req/s < ${t.minRps}`);
  return out;
}

export type Slot = { dentistId: string; chairId: string; startsAt: string };

/**
 * Bookings that never clash (the API's rule: no chair and no dentist twice at an overlapping time, at any branch),
 * inside the branch's hours, from `from` on. Each 30-minute step pairs dentist i with chair i; a closed hour or day jumps
 * to the next open start (the shared rules, never re-derived). Start far enough ahead that the seed's appointments,
 * and an earlier run's, are never in the way: each run passes its own `from`.
 */
export function* bookingSlots(hours: OpeningHours, dentistIds: readonly string[], chairIds: readonly string[], from: Date, durationMin = 30): Generator<Slot> {
  const pairs = Math.min(dentistIds.length, chairIds.length);
  if (pairs === 0) throw new Error("No dentist and chair to book with");
  let at = nextOpenStart(from, hours, durationMin);
  for (;;) {
    for (let i = 0; i < pairs; i++) yield { dentistId: dentistIds[i]!, chairId: chairIds[i]!, startsAt: at.toISOString() };
    const next = new Date(at.getTime() + durationMin * 60_000);
    at = outsideClinicHours(next, durationMin, hours) ? nextOpenStart(next, hours, durationMin) : next;
  }
}
