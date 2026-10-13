import type {
  Acknowledgement,
  Appointment,
  AppointmentRequest,
  AuditEvent,
  Branch,
  Chair,
  ChartEntry,
  ClinicAgreement,
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
  PriceList,
  PrivacyNotice,
  Procedure,
  Signup,
  StaffMember,
  StaffCredential,
  StaffPin,
  Subscription,
  Visit,
} from "@pedia/shared";
import { clearBlobs } from "./blob-store";
import { DEMO_ACCOUNT, DEMO_CLINIC_ID, seed } from "./seed";
import { IPIN_ACCOUNT, seedIpin } from "./seed-ipin";
import { NGITI_ACCOUNT, seedNgiti } from "./seed-ngiti";
import { SEED_PRICES, seedSignups } from "./seed-signups";
import { seedAgreements } from "./seed-privacy";
import { seedSubscriptions } from "./seed-subscriptions";

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
  staffCredentials: StaffCredential[]; // passwords of logins the Owner added or that changed theirs; never served
  privacyNotices: PrivacyNotice[]; // privacy #19: append-only versions, newest in force (P20)
  acknowledgements: Acknowledgement[]; // privacy #20, #21: who read which notice or confidentiality version, when
};

/**
 * A clinic account with nothing in it yet: the operator fills in its branch, Owner and reference data (decision #3).
 * Typed `Db`, so a collection added to Db without a value here fails typecheck.
 */
export const emptyDb = (): Db => ({
  branches: [], patients: [], staff: [], chairs: [], procedures: [], visits: [], chartEntries: [], noteTemplates: [],
  notes: [], growth: [], planItems: [], appointments: [], photos: [], dueItems: [], invoices: [], payments: [],
  messageTemplates: [], messages: [], documents: [], appointmentRequests: [], auditEvents: [], staffPins: [],
  staffCredentials: [], privacyNotices: [], acknowledgements: [],
});


/**
 * Everything the fake backend stores: the clinic accounts (what the operator sees), each account's own Db, and
 * Primolar's own records, which belong to no clinic: sign-ups (billing #12), the price list (#23) and one subscription
 * per clinic with its payments (#25–#30). Never inside a tenant.
 */
export type Platform = {
  accounts: ClinicAccount[];
  tenants: Record<string, Db>;
  signups: Signup[];
  prices: PriceList;
  subscriptions: Subscription[];
  agreements: ClinicAgreement[]; // privacy #7, #8, #23: append-only, the newest per clinic in force (P6)
};

export const seedPlatform = (): Platform => {
  const tenants = { [DEMO_ACCOUNT.id]: seed(), [NGITI_ACCOUNT.id]: seedNgiti(), [IPIN_ACCOUNT.id]: seedIpin() };
  const subscriptions = seedSubscriptions();
  return {
    accounts: [DEMO_ACCOUNT, NGITI_ACCOUNT, IPIN_ACCOUNT],
    tenants,
    signups: seedSignups(),
    prices: structuredClone(SEED_PRICES), // PUT /operator/prices replaces it; never share the constant
    subscriptions,
    agreements: seedAgreements(subscriptions, tenants), // privacy #11: signed on file, dated the approval day
  };
};

// v28: privacy (chunk 24): Platform gains `agreements`; each Db gains `privacyNotices` and `acknowledgements`; patients gain consents.
const KEY = "pedia-dental:mock-db:v28";

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
/** A staff login's own password, when it has one. Seeded logins have none and sign in with the demo password. */
export const credentialOf = (tenant: Db, staffId: string | undefined): StaffCredential | undefined =>
  staffId ? tenant.staffCredentials.find((c) => c.staffId === staffId) : undefined;
export const currentAccount = (): ClinicAccount => accountById(clinicId)!;

export function persist() {
  if (typeof window === "undefined") return; // handler tests run in Node
  window.localStorage.setItem(KEY, JSON.stringify(platform));
}

export function resetDb() {
  window.localStorage.removeItem(KEY);
  void clearBlobs().finally(() => window.location.reload());
}
