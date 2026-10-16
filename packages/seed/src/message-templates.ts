import {
  MessageKind,
  messageVars,
  renderMessage,
  type Message,
  type MessageTemplate,
  type Patient,
  type StaffMember,
} from "@pedia/shared";

/** Default wording, for the clinic to edit on the Messages page. Instructions need the dentist's review (plan Q5). */
const DEFAULTS: Record<MessageKind, [name: string, body: string]> = {
  appointment_confirmation: ["Appointment confirmation", "Hi {guardian_name}, {child_first_name}'s dental appointment at {clinic_name} is booked for {date} at {time} with {dentist_name}. Reply YES to confirm."],
  appointment_reminder: ["Appointment reminder", "Reminder: {child_first_name} has a dental appointment at {clinic_name} on {date} at {time} with {dentist_name}. Please arrive 10 minutes early."],
  post_extraction: ["Post-extraction instructions", "After {child_first_name}'s extraction: keep biting on the gauze for 30 minutes. No rinsing, spitting or straws today. Soft, cool food only. Call {clinic_name} if the bleeding doesn't stop."],
  post_pulpotomy: ["Post-pulpotomy instructions", "{child_first_name}'s tooth may feel sore for a day or two after today's pulpotomy. Give pain relief only as the dentist advised, and avoid hard or sticky food on that side."],
  fluoride_instructions: ["Fluoride instructions", "{child_first_name} had fluoride today. Please wait 30 minutes before eating or drinking, and don't brush until tonight."],
  pre_treatment: ["Pre-treatment instructions", "Before {child_first_name}'s visit on {date} at {time}: a light meal 2 hours before, brush teeth, and bring any medicines your child takes."],
  missed_appointment: ["Missed appointment", "Hi {guardian_name}, we missed {child_first_name} at {clinic_name} on {date}. Please reply or call us to book a new time."],
  follow_up_reminder: ["Follow-up reminder", "Hi {guardian_name}, {child_first_name} is due for a follow-up check on {date}. Please call {clinic_name} to book."],
  recall: ["Recall or 6-month checkup", "Hi {guardian_name}, it's time for {child_first_name}'s dental checkup (due {date}). Reply or call {clinic_name} to book."],
  birthday: ["Birthday greeting", "Happy birthday, {child_first_name}! Everyone at {clinic_name} wishes you a bright, healthy smile."],
};

export const defaultMessageTemplates = (clinicId: string, at: string): MessageTemplate[] =>
  MessageKind.options.map((kind) => ({ clinicId, kind, name: DEFAULTS[kind][0], body: DEFAULTS[kind][1], updatedAt: at }));

/** What happened, and to whom. `startsAt` / `dueOn` / `dentistId` feed the placeholders. */
export type MessageEvent = Pick<Message, "kind" | "patientId" | "sendAt" | "appointmentId" | "noteId" | "dueItemId"> & {
  startsAt?: string;
  dueOn?: string;
  dentistId?: string;
};

export type MessageRefs = { templates: MessageTemplate[]; patients: Patient[]; staff: StaffMember[]; clinicName: string };

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
