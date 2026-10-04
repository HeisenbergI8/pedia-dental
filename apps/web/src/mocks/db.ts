import type {
  Appointment,
  AppointmentRequest,
  AuditEvent,
  Chair,
  ChartEntry,
  ClinicalNote,
  ClinicalPhoto,
  DueItem,
  GrowthRecord,
  Invoice,
  Message,
  MessageTemplate,
  NoteTemplate,
  PatientDocument,
  Patient,
  Payment,
  PlanItem,
  Procedure,
  StaffMember,
  StaffPin,
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
  messageTemplates: MessageTemplate[]; // one per MessageKind
  messages: Message[]; // the outbox log; the prototype never sends
  documents: PatientDocument[]; // the generated-documents log; append-only, PDFs aren't stored
  appointmentRequests: AppointmentRequest[]; // from the parent portal; staff mark them handled
  auditEvents: AuditEvent[]; // who touched which personal data (RA 10173); append-only, written by mocks/access.ts
  staffPins: StaffPin[]; // each staff member's own PIN for switching user on a shared device; never served
};

// v19: appointments carry procedureCode, so a completed checkup or cleaning closes a due recall.
const KEY = "pedia-dental:mock-db:v19";

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
