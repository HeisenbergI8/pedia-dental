import { z } from "zod";
import { Appointment, AppointmentRequest } from "./appointment";
import { AuditAction, AuditEvent } from "./audit";
import { Invoice, Payment } from "./billing";
import { ChartEntry } from "./chart";
import { Id, IsoDateTime, Role } from "./common";
import { PatientDocument } from "./document";
import { GrowthRecord } from "./growth";
import { Message } from "./message";
import { ClinicalNote } from "./notes";
import { PatientView } from "./patient";
import { ClinicalPhoto } from "./photo";
import { PlanItem } from "./plan";
import { Visit } from "./visit";

/** The parts of a copy of records past the profile. Which ones a caller gets: RECORDS_COPY_SECTIONS (domain). */
export const RecordsCopySection = z.enum([
  "visits", "chart", "notes", "growth", "plan", "appointments", "appointmentRequests",
  "invoices", "payments", "messages", "photos", "documents",
]);
export type RecordsCopySection = z.infer<typeof RecordsCopySection>;

/**
 * B13c2a: a child's copy of records (RA 10173: access and portability), POST /patients/:id/exports. Only what the caller
 * may read: a section they can't read is absent and named in `omitted`, so the file says the clinic holds more.
 * Photos and documents are listed, not attached: each file opens through its own audited link. Signed notes only.
 */
export const RecordsCopy = z.object({
  kind: z.literal("primolar.records-copy"),
  version: z.literal(1),
  generatedAt: IsoDateTime,
  clinic: z.object({ id: Id, name: z.string() }),
  requestedBy: z.object({ name: z.string(), role: Role }),
  patient: PatientView,
  visits: z.array(Visit).optional(),
  chart: z.array(ChartEntry).optional(),
  notes: z.array(ClinicalNote).optional(),
  growth: z.array(GrowthRecord).optional(),
  plan: z.array(PlanItem).optional(),
  appointments: z.array(Appointment).optional(),
  appointmentRequests: z.array(AppointmentRequest).optional(),
  invoices: z.array(Invoice).optional(),
  payments: z.array(Payment).optional(),
  messages: z.array(Message).optional(),
  photos: z.array(ClinicalPhoto).optional(),
  documents: z.array(PatientDocument).optional(),
  omitted: z.array(RecordsCopySection),
});
export type RecordsCopy = z.infer<typeof RecordsCopy>;

/** GET /audit-log's query. `before` is the opaque cursor of the previous page's `next`. Newest first. */
export const AuditLogQuery = z.object({
  action: AuditAction.optional(),
  actorId: Id.optional(),
  patientId: Id.optional(),
  before: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuery>;

/** An entry with the child's name filled in by the server, so the screen never loads the whole patient list. */
export const AuditLogEntry = AuditEvent.extend({ patientName: z.string().optional() });
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const AuditLogPage = z.object({ entries: z.array(AuditLogEntry), next: z.string().optional() });
export type AuditLogPage = z.infer<typeof AuditLogPage>;
