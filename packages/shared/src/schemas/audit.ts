import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, Role } from "./common";

export const AuditAction = z.enum(["sign_in", "sign_in_failed", "sign_out", "timed_out", "view", "create", "update", "export", "denied"]);
export type AuditAction = z.infer<typeof AuditAction>;

/**
 * One entry in the audit trail (RA 10173: who accessed which personal data, and when). Append-only:
 * there is no endpoint to edit or delete one. The actor's name and role are copied in, so the entry
 * still says who it was after the account changes.
 */
export const AuditEvent = ClinicScoped.extend({
  id: Id,
  at: IsoDateTime,
  actorId: Id,
  actorName: z.string(),
  actorRole: Role,
  action: AuditAction,
  /** What was touched, in clinic words: "Dental chart", "Patient list", "Financial report". */
  record: z.string(),
  patientId: Id.optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
