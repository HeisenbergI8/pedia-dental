import type { Patient } from "@pedia/shared";
import { seed } from "./seed";

/**
 * In-browser fake database. Persisted to localStorage so demo data survives
 * a refresh. Add a collection here when a feature needs one.
 */
export type Db = {
  patients: Patient[];
};

const KEY = "pedia-dental:mock-db:v1";

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
  window.localStorage.setItem(KEY, JSON.stringify(db));
}

export function resetDb() {
  window.localStorage.removeItem(KEY);
  window.location.reload();
}
