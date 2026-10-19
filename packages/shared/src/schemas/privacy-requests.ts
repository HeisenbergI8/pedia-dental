import { z } from "zod";
import { Id, IsoDate, IsoDateTime } from "./common";

/** B13c2b E2: what the person asked for (RA 10173's rights, in the clinic's words on the screen). */
export const PrivacyRequestKind = z.enum(["access", "correction", "erasure", "objection", "other"]);
export type PrivacyRequestKind = z.infer<typeof PrivacyRequestKind>;
export const PrivacyRequestChannel = z.enum(["in_person", "phone", "text", "email", "letter"]);
export type PrivacyRequestChannel = z.infer<typeof PrivacyRequestChannel>;
export const PrivacyRequestStatus = z.enum(["open", "done", "declined"]);
export type PrivacyRequestStatus = z.infer<typeof PrivacyRequestStatus>;

/**
 * One request in the register (GET /privacy-requests). `dueOn` is stored when it is logged (E3: a later change of
 * PRIVACY_REQUEST_DUE_WORKING_DAYS moves no deadline). `patientName` is added by the server, as the audit log's.
 */
export const PrivacyRequest = z.object({
  id: Id,
  clinicId: Id,
  patientId: Id.optional(),
  patientName: z.string().optional(),
  kind: PrivacyRequestKind,
  requesterName: z.string(),
  relationship: z.string().optional(),
  channel: PrivacyRequestChannel,
  details: z.string().optional(),
  receivedOn: IsoDate,
  dueOn: IsoDate,
  status: PrivacyRequestStatus,
  outcome: z.string().optional(),
  loggedByName: z.string(),
  loggedAt: IsoDateTime,
  closedByName: z.string().optional(),
  closedAt: IsoDateTime.optional(),
});
export type PrivacyRequest = z.infer<typeof PrivacyRequest>;

/** POST /privacy-requests. Received on a day not after today (checked by the server with its clock). */
export const LogPrivacyRequestInput = z
  .object({
    patientId: Id.optional(),
    kind: PrivacyRequestKind,
    requesterName: z.string().trim().min(1, "Enter who asked").max(120, "Up to 120 characters"),
    relationship: z.string().trim().max(60, "Up to 60 characters").optional(),
    channel: PrivacyRequestChannel,
    details: z.string().trim().max(500, "Up to 500 characters").optional(),
    receivedOn: IsoDate,
  })
  .refine((r) => r.kind !== "erasure" || r.patientId, { message: "Choose the child whose record is to be erased", path: ["patientId"] });
export type LogPrivacyRequestInput = z.infer<typeof LogPrivacyRequestInput>;

/** POST /privacy-requests/:id/close. An erasure closed as done restricts the child's record (E5). */
export const ClosePrivacyRequestInput = z.object({
  status: z.enum(["done", "declined"]),
  outcome: z.string().trim().min(1, "Say what was done, or why it was declined").max(500, "Up to 500 characters"),
});
export type ClosePrivacyRequestInput = z.infer<typeof ClosePrivacyRequestInput>;

/** E4: `open` is every open request, soonest due first; `closed` is a page, newest closed first (`before` = requestCursor). */
export const PrivacyRequestQuery = z.object({
  status: z.enum(["open", "closed"]).default("open"),
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type PrivacyRequestQuery = z.infer<typeof PrivacyRequestQuery>;
export const PrivacyRequestPage = z.object({ requests: z.array(PrivacyRequest), next: z.string().optional() });
export type PrivacyRequestPage = z.infer<typeof PrivacyRequestPage>;
