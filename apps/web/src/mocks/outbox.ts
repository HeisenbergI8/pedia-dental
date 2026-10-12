import { format } from "date-fns";
import { birthdayGreeting, isBirthdayOn, preVisitMessageFor, reminderSendAt, type Appointment, type Message } from "@pedia/shared";
import { currentAccount, currentClinicId, db } from "./db";
import { composeMessage, type MessageEvent } from "./message-templates";

/** Feature 5's outbox. Events queue messages here and nothing is ever sent. The calling handler persists. */
export function queueMessage(e: MessageEvent): Message | undefined {
  const refs = { templates: db.messageTemplates, patients: db.patients, staff: db.staff, clinicName: currentAccount().name };
  const message = composeMessage(e, refs, { id: crypto.randomUUID(), clinicId: currentClinicId(), createdAt: new Date().toISOString() });
  if (message) db.messages.push(message);
  return message;
}

/** Booking (and rebooking) queues a confirmation now and a reminder the day before. */
export function queueBookingMessages(a: Appointment) {
  const base = { patientId: a.patientId, appointmentId: a.id, startsAt: a.startsAt, dentistId: a.dentistId };
  queueMessage({ ...base, kind: "appointment_confirmation", sendAt: new Date().toISOString() });
  queueMessage({ ...base, kind: "appointment_reminder", sendAt: reminderSendAt(a.startsAt) });
  // Some treatments need the parent to prepare (PROCEDURE_PRE_MESSAGES): sent with the reminder, withdrawn with it.
  const pre = preVisitMessageFor(a.procedureCode);
  if (pre) queueMessage({ ...base, kind: pre, sendAt: reminderSendAt(a.startsAt) });
}

/** A cancelled, moved or missed appointment withdraws what it queued and hasn't sent. */
export function cancelQueued(appointmentId: string) {
  for (const m of db.messages) {
    if (m.appointmentId === appointmentId && m.status === "queued") m.status = "cancelled";
  }
}

/** Stands in for the NestJS daily cron: today's birthday greetings, once a year each. Returns how many it queued. */
export function runDailyJobs(today = format(new Date(), "yyyy-MM-dd")): number {
  let queued = 0;
  for (const p of db.patients) {
    if (!isBirthdayOn(p.birthDate, today) || birthdayGreeting(db.messages, p.id, today)) continue;
    if (queueMessage({ kind: "birthday", patientId: p.id, sendAt: new Date().toISOString() })) queued++;
  }
  return queued;
}
