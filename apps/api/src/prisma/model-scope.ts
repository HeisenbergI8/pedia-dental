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
} as const satisfies Record<Prisma.ModelName, ModelScope>;

/**
 * Insert-only tables: no update, upsert or delete reaches them (CONVENTIONS → Domain rules → Append-only).
 * A correction is a new row. Chart entries, payments and agreements join this list in their chunks.
 */
export const APPEND_ONLY: ReadonlySet<string> = new Set<Prisma.ModelName>(["AuditEvent"]);
