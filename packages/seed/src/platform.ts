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
import { DEMO_ACCOUNT, seed } from "./seed";
import { IPIN_ACCOUNT, seedIpin } from "./seed-ipin";
import { NGITI_ACCOUNT, seedNgiti } from "./seed-ngiti";
import { SEED_PRICES, seedSignups } from "./seed-signups";
import { seedAgreements } from "./seed-privacy";
import { seedSubscriptions } from "./seed-subscriptions";

/**
 * One clinic account's data (one tenant). The web persists it inside `Platform`; the API maps it to rows.
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
