import type { Prisma } from "../generated/prisma/client.ts";

export type Holds = "clinical record" | "personal data" | "money" | "audit trail" | "account" | "system";
/**
 * `keep`: in plain words. `enforcedBy`: a Job's name, "kept" (never deleted by the system), or "B13c2b" (erasure and
 * the clinic's return at cancellation, not built yet). `counsel`: the period is a legal threshold to confirm.
 */
export type Retention = { holds: Holds; keep: string; enforcedBy: string; counsel?: true };

const RECORD = "While the clinic subscribes; afterwards as the law on health records requires (confirm with counsel), then returned or deleted at the clinic's written request";
const MONEY = "As the tax law requires for books and receipts (confirm with counsel; proposed 10 years)";
const CLINIC: Retention = { holds: "clinical record", keep: RECORD, enforcedBy: "B13c2b", counsel: true };
const PERSONAL: Retention = { holds: "personal data", keep: RECORD, enforcedBy: "B13c2b", counsel: true };
const BOOKS: Retention = { holds: "money", keep: MONEY, enforcedBy: "kept", counsel: true };
const SETUP: Retention = { holds: "account", keep: "While the clinic subscribes, then with its records", enforcedBy: "B13c2b" };

/**
 * B13c2a: the retention schedule as data. Total over the Prisma models (the `satisfies` fails tsc, the test fails
 * check); PRIVACY_OPERATIONS.md's inventory is generated from it (inventory.test.ts).
 */
export const RETENTION_SCHEDULE = {
  // The child's record
  Patient: CLINIC, PatientGuardian: PERSONAL, PatientConsent: CLINIC, PatientPrivacyConsent: CLINIC, PrivacyChoice: CLINIC,
  Visit: CLINIC, ChartEntry: CLINIC, ClinicalNote: CLINIC, GrowthRecord: CLINIC, PlanItem: CLINIC,
  ClinicalPhoto: CLINIC, PatientDocument: CLINIC, Appointment: PERSONAL, AppointmentRequest: PERSONAL, DueItem: PERSONAL,
  Message: PERSONAL, PortalAccount: PERSONAL,
  StoredFile: { holds: "system", keep: "While its file exists", enforcedBy: "kept" },
  // Money
  Invoice: BOOKS, InvoiceLine: BOOKS, Payment: BOOKS, ReceiptCounter: BOOKS,
  // Audit
  AuditEvent: { holds: "audit trail", keep: "While the clinic's records are kept (confirm with counsel)", enforcedBy: "kept", counsel: true },
  OperatorAuditEvent: { holds: "audit trail", keep: "OPERATOR_AUDIT_KEEP_DAYS once confirmed with counsel (proposed 5 years); unset keeps it forever", enforcedBy: "operator-audit.prune", counsel: true },
  PrivacyRequest: { holds: "audit trail", keep: "While the clinic's records are kept: how each request was answered (confirm with counsel)", enforcedBy: "kept", counsel: true },
  // The clinic's setup and logins
  Branch: SETUP, Staff: SETUP, Chair: SETUP, Procedure: SETUP, NoteTemplate: SETUP, MessageTemplate: SETUP,
  Acknowledgement: { ...SETUP, holds: "audit trail", counsel: true }, PrivacyNotice: SETUP,
  Credential: { holds: "account", keep: "Until the login is removed", enforcedBy: "kept" },
  Session: { holds: "system", keep: "30 minutes idle, 8 hours at most", enforcedBy: "auth.sweep" },
  PortalLink: { holds: "system", keep: "30 days after the link expires", enforcedBy: "portal.prune-links" },
  RateLimitCounter: { holds: "system", keep: "Until its window ends", enforcedBy: "auth.sweep" },
  IdempotencyKey: { holds: "system", keep: "24 hours", enforcedBy: "idempotency.sweep" },
  DemoLogin: { holds: "system", keep: "Demo deployments only; reset nightly", enforcedBy: "kept" },
  // Primolar's own
  ClinicAccount: { holds: "account", keep: "While the clinic subscribes, then as the DPA says (confirm with counsel)", enforcedBy: "B13c2b", counsel: true },
  Agreement: { holds: "audit trail", keep: "As long as any obligation under it can be raised (confirm with counsel)", enforcedBy: "kept", counsel: true },
  Signup: { holds: "account", keep: "Kept; a rejected sign-up's files go after 30 days", enforcedBy: "signups.purge-rejected-files" },
  Subscription: BOOKS, SubscriptionPayment: BOOKS, SubscriptionLine: BOOKS, InvoiceCounter: BOOKS, PaymentReceipt: BOOKS,
  PlatformSettings: { holds: "system", keep: "Kept", enforcedBy: "kept" }, PriceChange: { holds: "money", keep: "Kept: the prices Primolar's invoices were billed at (confirm with counsel)", enforcedBy: "kept", counsel: true },
  OperatorUser: { holds: "account", keep: "While the person works for Primolar", enforcedBy: "kept" },
  OperatorSession: { holds: "system", keep: "30 minutes idle, 8 hours at most", enforcedBy: "auth.sweep" },
  OutboxMessage: { holds: "system", keep: "Sent rows 7 days; failed rows kept for repair", enforcedBy: "outbox.prune" },
  JobLock: { holds: "system", keep: "Kept (one row per job)", enforcedBy: "kept" },
} as const satisfies Record<Prisma.ModelName, Retention>;

/** The inventory table PRIVACY_OPERATIONS.md carries between its markers (inventory.test.ts). Sorted by what it holds. */
export function retentionInventory(): string {
  const rows = Object.entries(RETENTION_SCHEDULE)
    .sort(([a, x], [b, y]) => x.holds.localeCompare(y.holds) || a.localeCompare(b))
    .map(([model, r]) => `| ${model} | ${r.holds} | ${r.keep} | ${r.enforcedBy} | ${"counsel" in r ? "yes" : ""} |`);
  return ["| Table | Holds | Kept | Enforced by | Confirm with counsel |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}
