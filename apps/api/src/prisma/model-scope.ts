import type { Prisma } from "../generated/prisma/client.ts";

/** "clinic" adds clinicId; "branch" adds clinicId and branchId; "platform" is unscoped. */
export type ModelScope = "clinic" | "branch" | "platform";

/**
 * Every model and how the tenant extension scopes it. Total on purpose: a new model missing here fails `tsc`
 * and tenant-scope.test.ts. Platform models are the operator's and the sign-up's (accounts, sign-ups, prices,
 * subscriptions) and the system's (outbox, job locks); everything holding a clinic's data is "clinic" or "branch".
 */
export const MODEL_SCOPE = {
  AuditEvent: "clinic",
  // Tenant data
  Branch: "clinic",
  Staff: "clinic",
  Acknowledgement: "clinic",
  PrivacyNotice: "clinic",
  // B3: what a clinic configures. Chair is branch-level data read account-wide (GET /chairs), so "clinic": the
  // "branch" scope would narrow every read to the device's branch.
  Chair: "clinic",
  Procedure: "clinic",
  NoteTemplate: "clinic",
  MessageTemplate: "clinic",
  // B4: the child's record. Patients aren't branch-level: every branch of the account sees the same child.
  Patient: "clinic",
  PatientGuardian: "clinic",
  PatientConsent: "clinic",
  PatientPrivacyConsent: "clinic",
  PrivacyChoice: "clinic",
  // B5: the clinical core. Visits aren't branch-level in the contract (ClinicScoped): every branch sees the same child.
  Visit: "clinic",
  ChartEntry: "clinic",
  // B6: the rest of the clinical record. Not append-only: a draft note is edited, a growth record replaced and a plan
  // item's status changed in place. A signed note is read-only by NotesService (decision 6), not by the extension.
  ClinicalNote: "clinic",
  GrowthRecord: "clinic",
  PlanItem: "clinic",
  // B7: the schedule. Appointment is branch-level data read account-wide (conflicts across branches, a child's list,
  // branch=all reports), so "clinic" with branchId as a plain column, as Chair (E5). Requests and due items are ClinicScoped.
  Appointment: "clinic",
  AppointmentRequest: "clinic",
  DueItem: "clinic",
  // B8: money. Invoice and Payment are branch-level data read account-wide (a family's balance, a child's history,
  // branch=all reports), so "clinic" with branchId a plain column, as Appointment (E5). Keys and counters are per clinic.
  Invoice: "clinic",
  InvoiceLine: "clinic",
  Payment: "clinic",
  ReceiptCounter: "clinic",
  IdempotencyKey: "clinic",
  // B9: the message log. Clinic-level (a message speaks for the account, whichever branch).
  Message: "clinic",
  // B10: clinical photos, the issued-documents log, and the ledger of stored files (E5).
  ClinicalPhoto: "clinic",
  PatientDocument: "clinic",
  StoredFile: "clinic",
  PortalAccount: "clinic", // B11
  // Platform: Primolar's own records
  ClinicAccount: "platform",
  Agreement: "platform",
  OperatorUser: "platform",
  OperatorSession: "platform",
  // Platform but holding a clinicId: read before any clinic is known (sign-in by email or mobile, the cookie, the login page, a texted link).
  // Every query on these names clinicId itself (CONVENTIONS → Decisions: identity tables).
  Credential: "platform",
  PortalLink: "platform", // B11: found by token hash before the clinic is known; every query names clinicId
  Session: "platform",
  DemoLogin: "platform",
  // Counted before sign-in, per client address, never per clinic.
  RateLimitCounter: "platform",
  // The system's: the worker and the scheduler read across clinics. Handlers run inside the row's clinic.
  OutboxMessage: "platform",
  JobLock: "platform",
  // B12: Primolar's billing. Sign-ups exist before any clinic; subscriptions, payments and receipts are read across
  // clinics by the console and the jobs. Every query names clinicId itself where the row has one.
  PlatformSettings: "platform",
  PriceChange: "platform",
  Signup: "platform",
  Subscription: "platform",
  SubscriptionPayment: "platform",
  SubscriptionLine: "platform",
  InvoiceCounter: "platform",
  PaymentReceipt: "platform",
} as const satisfies Record<Prisma.ModelName, ModelScope>;

/**
 * Insert-only tables: no update, upsert or delete reaches them (CONVENTIONS → Domain rules → Append-only).
 * A correction is a new row. B8: payments (a refund is a negative row).
 */
export const APPEND_ONLY: ReadonlySet<string> = new Set<Prisma.ModelName>([
  "AuditEvent", "Agreement", "Acknowledgement", "PrivacyNotice",
  // B4: consents are never edited (privacy #12–#17). A change of mind is a new PrivacyChoice row.
  "PatientConsent", "PatientPrivacyConsent", "PrivacyChoice",
  // B5: chart entries (CHUNKS B5). A correction is a new row with `supersedes`.
  "ChartEntry",
  // B8: payments. A refund or a returned credit is a new row.
  "Payment",
  // B10: photos are part of the medical record (decision 5); an issued document is a fact (decision 6).
  "ClinicalPhoto", "PatientDocument",
  // B12: a saved price list, a month paid to Primolar and its invoice lines.
  "PriceChange", "SubscriptionPayment", "SubscriptionLine",
]);
