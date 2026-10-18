import { format } from "date-fns";
import {
  FAILURE,
  TIER_LIMITS,
  birthdayGreeting,
  choiceDeclined,
  isBirthdayOn,
  nextSendingTime,
  preVisitMessageFor,
  reminderSendAt,
  smsNumber,
  smsSegments,
  textPartsRefusal,
  type Appointment,
  type Message,
} from "@pedia/shared";
import { manilaMonthOf, textPartsUsed } from "./allowances";
import { currentAccount, currentClinicId, db } from "./db";
import { composeMessage, type MessageEvent } from "@pedia/seed";

/** Feature 5's outbox. Events queue messages here and nothing is ever sent. The calling handler persists. */
export function queueMessage(e: MessageEvent): Message | undefined {
  // Privacy #14 (P15): a family that declined reminder messages gets no SMS or email at all. Manual sends say why first.
  const patient = db.patients.find((p) => p.id === e.patientId);
  if (patient && choiceDeclined(patient, "reminders")) return undefined;
  const refs = { templates: db.messageTemplates, patients: db.patients, staff: db.staff, clinicName: currentAccount().name };
  // Decision 4: inside sending hours. Decision 12: no usable number fails at once (the API's queue does the same).
  const sendAt = nextSendingTime(new Date(e.sendAt)).toISOString();
  const composed = composeMessage({ ...e, sendAt }, refs, { id: crypto.randomUUID(), clinicId: currentClinicId(), createdAt: new Date().toISOString() });
  const unusable = composed && !smsNumber(composed.to) && FAILURE.noPhone;
  // B12 decisions 2, 3, 19: past the month's parts, a template text is logged as not sent and never sent later.
  const overLimit =
    composed && textPartsRefusal(composed.kind, textPartsUsed(db, manilaMonthOf(sendAt)), smsSegments(composed.body), TIER_LIMITS[currentAccount().tier].textParts);
  const failure = unusable || overLimit;
  const message = composed && failure ? { ...composed, status: "failed" as const, failureReason: failure } : composed;
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
