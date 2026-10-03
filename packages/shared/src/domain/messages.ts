import { addDays, format, parseISO, setHours, startOfDay } from "date-fns";
import type { Patient } from "../schemas/patient";
import type { MessageKind } from "../schemas/message";

/** Shown on messages and documents until the clinic has a settings record (chunks-11-12 Q7). */
export const CLINIC_NAME = "Pedia Dental";

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

/** The values for one patient. `startsAt` (appointment) gives date and time; `dueOn` (recall) gives a date only. */
export function messageVars(
  patient: Pick<Patient, "firstName" | "lastName" | "guardians">,
  at: { startsAt?: string; dueOn?: string; dentistName?: string } = {},
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
    clinic_name: CLINIC_NAME,
  };
}

/** Which instructions a signed note sends, by Procedure.code. Data, like DEFAULT_FOLLOW_UP_RULES. */
export const NOTE_MESSAGES: Partial<Record<string, MessageKind>> = {
  extraction: "post_extraction",
  pulpotomy: "post_pulpotomy",
  fluoride: "fluoride_instructions",
};

/** The reminder goes out at 9 AM the day before. Booked after that, it goes out now. */
export function reminderSendAt(startsAt: string, now = new Date()): string {
  const at = setHours(startOfDay(addDays(parseISO(startsAt), -1)), 9);
  return (at < now ? now : at).toISOString();
}
