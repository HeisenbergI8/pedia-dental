import { z } from "zod";
import { Centavos, IsoDate } from "./common";
import { Patient } from "./patient";

/** The patient list's one-tap filters. No Kids/Adults: every seeded patient is 2–14 (measured 2026-10-03). */
export const PatientFilter = z.enum(["all", "needs_attention", "recent_visit", "balance_due", "recall_due"]);
export type PatientFilter = z.infer<typeof PatientFilter>;

export const PatientSort = z.enum(["name", "last_visit", "balance"]);
export type PatientSort = z.infer<typeof PatientSort>;

export const PAGE_SIZE = 20;

/** GET /patient-summaries query string. Unknown or missing values fall back to the defaults. */
export const PatientListQuery = z.object({
  q: z.string().trim().catch(""),
  filter: PatientFilter.catch("all"),
  sort: PatientSort.catch("name"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(PAGE_SIZE),
});
export type PatientListQuery = z.infer<typeof PatientListQuery>;

/** Computed on every request from due items, invoices, payments, messages, visits and appointments. Never stored. */
export const PatientFlags = z.object({ recallDue: z.boolean(), balanceDue: z.boolean(), noContact: z.boolean() });
export type PatientFlags = z.infer<typeof PatientFlags>;

/** One row of the patient list. Contact details only reach callers holding `patients.contact`. */
export const PatientSummary = Patient.pick({
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  allergies: true,
  medicalConditions: true,
  alerts: true,
}).extend({
  guardianName: z.string(),
  guardianPhone: z.string().optional(), // only with patients.contact
  siblings: z.array(z.string()), // first names of children sharing a guardian phone, computed server-side
  lastVisitOn: IsoDate.optional(),
  balance: Centavos.optional(), // only with billing.view
  recallDueOn: IsoDate.optional(), // the earliest open recall or follow-up due date, when flags.recallDue
  flags: PatientFlags,
});
export type PatientSummary = z.infer<typeof PatientSummary>;

export const PatientPage = z.object({
  rows: z.array(PatientSummary),
  total: z.number().int(), // rows matching search + filter, across every page
  page: z.number().int(), // clamped to the last page
  pageSize: z.number().int(),
  counts: z.record(PatientFilter, z.number().int()), // per filter, after search: the numbers on the chips
});
export type PatientPage = z.infer<typeof PatientPage>;
