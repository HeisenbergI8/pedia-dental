import type {
  Appointment,
  Chair,
  ChartEntry,
  ClinicalNote,
  ClinicalPhoto,
  DueItem,
  GrowthRecord,
  Invoice,
  NoteTemplate,
  Patient,
  Payment,
  PlanItem,
  Procedure,
  StaffMember,
  Visit,
} from "@pedia/shared";
import { clearBlobs } from "./blob-store";
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
  chartEntries: ChartEntry[];
  noteTemplates: NoteTemplate[];
  notes: ClinicalNote[];
  growth: GrowthRecord[];
  planItems: PlanItem[];
  appointments: Appointment[];
  photos: ClinicalPhoto[]; // metadata only; the files live in blob-store.ts
  dueItems: DueItem[];
  invoices: Invoice[];
  payments: Payment[]; // append-only; refunds are negative rows
};

// v10: Chunk 12 added invoices and payments.
const KEY = "pedia-dental:mock-db:v10";

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
  void clearBlobs().finally(() => window.location.reload());
}
