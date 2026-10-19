import type { Permission } from "../schemas/auth";
import type { Role } from "../schemas/common";
import type { RecordsCopy, RecordsCopySection } from "../schemas/privacy-operations";
import { rolesCan } from "./permissions";

/**
 * B13c2a: a copy holds a section when the caller holds any of the permissions of the route that reads it
 * (RULES in mocks/access.ts; records-copy.rules.test.ts holds the two equal). Data, not `if` statements.
 */
export const RECORDS_COPY_SECTIONS = {
  visits: ["clinical.view"],
  chart: ["clinical.view"],
  notes: ["clinical.view"],
  growth: ["clinical.view"],
  plan: ["plan.view"],
  appointments: ["appointments.view"],
  appointmentRequests: ["appointments.manage", "appointments.request"],
  invoices: ["billing.view"],
  payments: ["billing.view"],
  messages: ["messages.view"],
  photos: ["clinical.view", "uploads.create"],
  documents: ["documents.issue"],
} as const satisfies Record<RecordsCopySection, readonly Permission[]>;

const SECTIONS = Object.keys(RECORDS_COPY_SECTIONS) as RecordsCopySection[];

/** The sections these roles get, and the ones left out. The route already proved the child is the caller's. */
export function copySections(roles: readonly Role[]): { included: RecordsCopySection[]; omitted: RecordsCopySection[] } {
  const holds = (s: RecordsCopySection) => RECORDS_COPY_SECTIONS[s].some((p) => rolesCan(roles, p));
  return { included: SECTIONS.filter(holds), omitted: SECTIONS.filter((s) => !holds(s)) };
}

/** "records-dela-cruz-ana-2026-10-19.json": the browser's file name, never sent to a server or a log. */
export function recordsCopyFileName(copy: Pick<RecordsCopy, "patient" | "generatedAt">): string {
  // Accents drop to their letter (Ñ → n); any other punctuation separates words (Dela Cruz/Ñ → dela-cruz-n).
  const slug = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, " ").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return `records-${slug(copy.patient.lastName)}-${slug(copy.patient.firstName)}-${copy.generatedAt.slice(0, 10)}.json`;
}

/** The audit log's cursor: the last entry's time and id, newest first. Opaque to the web. */
export const auditCursor = (e: { at: string; id: string }) => `${e.at}|${e.id}`;

/** Undefined for anything that isn't a cursor this API made (the route answers 400). */
export function readAuditCursor(cursor: string): { at: string; id: string } | undefined {
  const [at, id, extra] = cursor.split("|");
  return at && id && extra === undefined && !Number.isNaN(Date.parse(at)) ? { at, id } : undefined;
}
