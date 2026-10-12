import type {
  Appointment,
  AppointmentRequest,
  AuditEvent,
  Branch,
  Chair,
  ChartEntry,
  ClinicAccount,
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
import { DEMO_ACCOUNT, DEMO_CLINIC_ID, seed } from "./seed";
import { NGITI_ACCOUNT, seedNgiti } from "./seed-ngiti";

/**
 * One clinic account's data (one tenant). Persisted inside `Platform` so demo data survives a refresh.
 * Add a collection here when a feature needs one.
 */
export type Db = {
  branches: Branch[]; // archived ones too: their history stays in records and reports
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

/** Everything the fake backend stores: the clinic accounts (what the operator sees) and each account's own Db. */
export type Platform = { accounts: ClinicAccount[]; tenants: Record<string, Db> };

export const seedPlatform = (): Platform => ({
  accounts: [DEMO_ACCOUNT, NGITI_ACCOUNT],
  tenants: { [DEMO_ACCOUNT.id]: seed(), [NGITI_ACCOUNT.id]: seedNgiti() },
});

// v24: one store per clinic account (Primolar tenancy): the demo clinic with two branches, plus a second account.
const KEY = "pedia-dental:mock-db:v24";

function load(): Platform {
  if (typeof window === "undefined") return seedPlatform();
  const raw = window.localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw) as Platform;
  const fresh = seedPlatform();
  window.localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export const platform: Platform = load();

let clinicId = DEMO_CLINIC_ID;
/**
 * The signed-in account's data. An ESM live binding: `selectTenant` repoints it and every module that imported `db`
 * sees the new value, so a handler can only ever reach its own account's rows. Only `sessionOf` (mocks/access.ts)
 * and the auth handlers call `selectTenant`, and the access gate runs first on every request.
 * NestJS: a `WHERE clinic_id = ?` on every query instead; the HTTP contract is the same.
 */
export let db: Db = platform.tenants[clinicId]!;

export function selectTenant(id: string): Db | undefined {
  const tenant = platform.tenants[id];
  if (tenant) {
    db = tenant;
    clinicId = id;
  }
  return tenant;
}

/** Stamped on every new record. Replaces the hard-coded CLINIC_ID. */
export const currentClinicId = () => clinicId;
export const accountById = (id: string): ClinicAccount | undefined => platform.accounts.find((a) => a.id === id);
export const currentAccount = (): ClinicAccount => accountById(clinicId)!;

export function persist() {
  if (typeof window === "undefined") return; // handler tests run in Node
  window.localStorage.setItem(KEY, JSON.stringify(platform));
}

export function resetDb() {
  window.localStorage.removeItem(KEY);
  void clearBlobs().finally(() => window.location.reload());
}
