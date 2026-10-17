import { addDays, format, parseISO, setHours, startOfDay } from "date-fns";
import type { Patient } from "../schemas/patient";
import type { StaffMember } from "../schemas/clinic";
import type { Message, MessageKind, MessageTemplate } from "../schemas/message";

/** Every placeholder a template may use, with the label the editor shows. */
export const PLACEHOLDERS = {
  child_first_name: "Child's first name",
  child_name: "Child's full name",
  guardian_name: "Parent or guardian",
  date: "Appointment or due date",
  time: "Appointment time",
  dentist_name: "Dentist",
  clinic_name: "Clinic name",
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;
export type MessageVars = Partial<Record<Placeholder, string>>;

const TOKEN = /\{(\w+)\}/g;
const isPlaceholder = (key: string): key is Placeholder => key in PLACEHOLDERS;

/** Placeholders in `body` that don't exist, e.g. a misspelled {child_nmae}. */
export function unknownPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1]!).filter((key) => !isPlaceholder(key)))];
}

/** Fills placeholders. One without a value stays as written, so the gap shows instead of vanishing. */
export function renderMessage(body: string, vars: MessageVars): string {
  return body.replace(TOKEN, (whole, key: string) => (isPlaceholder(key) && vars[key]) || whole);
}

/**
 * The values for one patient. `startsAt` (appointment) gives date and time; `dueOn` (recall) gives a date only.
 * `clinicName` is the clinic account's name: every message speaks for the account, whichever branch.
 */
export function messageVars(
  patient: Pick<Patient, "firstName" | "lastName"> & { guardians: Pick<Patient["guardians"][number], "fullName" | "isPrimary">[] },
  at: { clinicName: string; startsAt?: string; dueOn?: string; dentistName?: string },
): MessageVars {
  const guardian = patient.guardians.find((g) => g.isPrimary) ?? patient.guardians[0];
  const when = at.startsAt ?? at.dueOn;
  return {
    child_first_name: patient.firstName,
    child_name: `${patient.firstName} ${patient.lastName}`,
    guardian_name: guardian?.fullName,
    date: when && format(parseISO(when), "EEE, MMM d"),
    time: at.startsAt && format(parseISO(at.startsAt), "h:mm a"),
    dentist_name: at.dentistName,
    clinic_name: at.clinicName,
  };
}

/** Which instructions a signed note sends, by Procedure.code. Data, like DEFAULT_FOLLOW_UP_RULES. */
export const NOTE_MESSAGES: Partial<Record<string, MessageKind>> = {
  extraction: "post_extraction",
  pulpotomy: "post_pulpotomy",
  fluoride: "fluoride_instructions",
};

/** Which instructions a booking sends before the visit, by Appointment.procedureCode. Data, like NOTE_MESSAGES. */
export const PROCEDURE_PRE_MESSAGES: Partial<Record<string, MessageKind>> = {
  extraction: "pre_treatment",
  pulpotomy: "pre_treatment",
};
export const preVisitMessageFor = (procedureCode?: string) => (procedureCode ? PROCEDURE_PRE_MESSAGES[procedureCode] : undefined);

/** The reminder goes out at 9 AM the day before. Booked after that, it goes out now. */
export function reminderSendAt(startsAt: string, now = new Date()): string {
  const at = setHours(startOfDay(addDays(parseISO(startsAt), -1)), 9);
  return (at < now ? now : at).toISOString();
}

/** A birthday today: month and day match. 29 February matches only in leap years (the daily job's rule). */
export const isBirthdayOn = (birthDate: string, today: string) => birthDate.slice(5) === today.slice(5);

/** This calendar year's birthday message for the child, if any. Once a year, whatever its status (outbox.ts). */
export function birthdayGreeting<M extends Pick<Message, "patientId" | "kind" | "createdAt">>(
  messages: M[],
  patientId: string,
  today: string,
): M | undefined {
  return messages.filter((m) => m.patientId === patientId && m.kind === "birthday" && m.createdAt.startsWith(today.slice(0, 4))).at(-1);
}

/** What happened, and to whom. `startsAt` / `dueOn` / `dentistId` feed the placeholders. */
export type MessageEvent = Pick<Message, "kind" | "patientId" | "sendAt" | "appointmentId" | "noteId" | "dueItemId"> & {
  startsAt?: string;
  dueOn?: string;
  dentistId?: string;
};

/** The API passes only the patient, dentist and template it loaded; the mock passes its whole db. */
export type MessageRefs = {
  templates: Pick<MessageTemplate, "kind" | "body">[];
  patients: Patient[];
  staff: Pick<StaffMember, "id" | "fullName">[];
  clinicName: string;
};

/** One queued SMS to the primary guardian, rendered now. Undefined without a template, patient or guardian. */
export function composeMessage(e: MessageEvent, refs: MessageRefs, meta: Pick<Message, "id" | "clinicId" | "createdAt">): Message | undefined {
  const template = refs.templates.find((t) => t.kind === e.kind);
  const patient = refs.patients.find((p) => p.id === e.patientId);
  const guardian = patient?.guardians.find((g) => g.isPrimary);
  if (!template || !patient || !guardian) return undefined;
  const dentistName = refs.staff.find((s) => s.id === e.dentistId)?.fullName;
  return {
    ...meta,
    patientId: patient.id,
    kind: e.kind,
    channel: "sms",
    to: guardian.phone,
    recipientName: guardian.fullName,
    body: renderMessage(template.body, messageVars(patient, { clinicName: refs.clinicName, startsAt: e.startsAt, dueOn: e.dueOn, dentistName })),
    status: "queued",
    sendAt: e.sendAt,
    appointmentId: e.appointmentId,
    noteId: e.noteId,
    dueItemId: e.dueItemId,
  };
}
