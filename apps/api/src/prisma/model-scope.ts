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
  // Platform: Primolar's own records
  ClinicAccount: "platform",
  Agreement: "platform",
  OperatorUser: "platform",
  OperatorSession: "platform",
  // Platform but holding a clinicId: read before any clinic is known (sign-in by email, the cookie, the login page).
  // Every query on these names clinicId itself (CONVENTIONS → Decisions: identity tables).
  Credential: "platform",
  Session: "platform",
  DemoLogin: "platform",
  // Counted before sign-in, per client address, never per clinic.
  RateLimitCounter: "platform",
  // The system's: the worker and the scheduler read across clinics. Handlers run inside the row's clinic.
  OutboxMessage: "platform",
  JobLock: "platform",
} as const satisfies Record<Prisma.ModelName, ModelScope>;

/**
 * Insert-only tables: no update, upsert or delete reaches them (CONVENTIONS → Domain rules → Append-only).
 * A correction is a new row. Chart entries, payments and agreements join this list in their chunks.
 */
export const APPEND_ONLY: ReadonlySet<string> = new Set<Prisma.ModelName>(["AuditEvent", "Agreement", "Acknowledgement", "PrivacyNotice"]);
