import type { Chair, Patient, Procedure, StaffMember, Visit } from "@pedia/shared";
import { seed } from "./seed";

/**
 * In-browser fake database. Persisted to localStorage so demo data survives
 * a refresh. Add a collection here when a feature needs one.
 */
export type Db = {
  patients: Patient[];
  staff: StaffMember[];
  chairs: Chair[];
  procedures: Procedure[];
  visits: Visit[];
};

const KEY = "pedia-dental:mock-db:v2";

function load(): Db {
  if (typeof window === "undefined") return seed();
  const raw = window.localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw) as Db;
  const fresh = seed();
  window.localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export const db: Db = load();

export function persist() {
  if (typeof window === "undefined") return; // handler tests run in Node
  window.localStorage.setItem(KEY, JSON.stringify(db));
}

export function resetDb() {
  window.localStorage.removeItem(KEY);
  window.location.reload();
}
