import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import {
  BookAppointmentInput,
  ChangeAppointmentStatusInput,
  RescheduleAppointmentInput,
  canReschedule,
  canTransition,
  findConflict,
  isDueItemOpen,
  type Appointment,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { cancelQueued, queueBookingMessages, queueMessage } from "@/mocks/outbox";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;
const byStart = (a: Appointment, b: Appointment) => a.startsAt.localeCompare(b.startsAt);

/** 400 for unknown references, 409 for a double-booking. Undefined when the slot is free. */
function rejectSlot(slot: Appointment) {
  if (!db.staff.some((s) => s.id === slot.dentistId && s.role === "dentist")) {
    return new HttpResponse("Unknown dentist", { status: 400 });
  }
  if (!db.chairs.some((c) => c.id === slot.chairId)) return new HttpResponse("Unknown chair", { status: 400 });
  const conflict = findConflict(slot, db.appointments);
  if (!conflict) return undefined;
  const who =
    conflict.on === "chair"
      ? db.chairs.find((c) => c.id === conflict.appointment.chairId)?.name
      : db.staff.find((s) => s.id === conflict.appointment.dentistId)?.fullName;
  const when = format(new Date(conflict.appointment.startsAt), "h:mm a");
  return new HttpResponse(`${who} is already booked at ${when}`, { status: 409 });
}

/** API contract for apps/api's AppointmentsController. */
export const appointmentHandlers = [
  // Appointments starting in [from, to). Both are ISO timestamps.
  http.get(url("/appointments"), async ({ request }) => {
    await delay(100);
    const params = new URL(request.url).searchParams;
    const from = new Date(params.get("from") ?? 0).getTime();
    const to = new Date(params.get("to") ?? 8.64e15).getTime();
    const rows = db.appointments.filter((a) => {
      const t = new Date(a.startsAt).getTime();
      return t >= from && t < to;
    });
    return HttpResponse.json(rows.sort(byStart));
  }),

  http.get(url("/patients/:id/appointments"), async ({ params }) => {
    await delay(100);
    return HttpResponse.json(db.appointments.filter((a) => a.patientId === params.id).sort(byStart));
  }),

  http.post(url("/appointments"), async ({ request }) => {
    const parsed = BookAppointmentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!db.patients.some((p) => p.id === parsed.data.patientId)) {
      return new HttpResponse("Patient not found", { status: 404 });
    }
    const appointment: Appointment = { ...parsed.data, id: crypto.randomUUID(), clinicId: CLINIC_ID, status: "booked" };
    const rejected = rejectSlot(appointment);
    if (rejected) return rejected;
    db.appointments.push(appointment);
    // Booked from the due list: the patient's earliest open item for that rule is now booked.
    if (appointment.sourceRuleId) {
      const due = db.dueItems
        .filter((i) => i.patientId === appointment.patientId && i.ruleId === appointment.sourceRuleId && isDueItemOpen(i, db.appointments))
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
      if (due) due.appointmentId = appointment.id;
    }
    queueBookingMessages(appointment); // a confirmation now, a reminder the day before
    persist();
    return HttpResponse.json(appointment, { status: 201 });
  }),

  http.put(url("/appointments/:id"), async ({ params, request }) => {
    const appointment = db.appointments.find((a) => a.id === params.id);
    if (!appointment) return new HttpResponse("Appointment not found", { status: 404 });
    const parsed = RescheduleAppointmentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!canReschedule(appointment.status)) {
      return new HttpResponse("Only booked or confirmed appointments can be moved", { status: 409 });
    }
    const moved = { ...appointment, ...parsed.data };
    const rejected = rejectSlot(moved);
    if (rejected) return rejected;
    Object.assign(appointment, parsed.data);
    cancelQueued(appointment.id); // the old time's reminder must not go out
    queueBookingMessages(appointment);
    persist();
    return HttpResponse.json(appointment);
  }),

  http.post(url("/appointments/:id/status"), async ({ params, request }) => {
    const appointment = db.appointments.find((a) => a.id === params.id);
    if (!appointment) return new HttpResponse("Appointment not found", { status: 404 });
    const parsed = ChangeAppointmentStatusInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!canTransition(appointment.status, parsed.data.status)) {
      return new HttpResponse(`Can't go from ${appointment.status} to ${parsed.data.status}`, { status: 409 });
    }
    Object.assign(appointment, parsed.data);
    if (appointment.status === "cancelled" || appointment.status === "no_show") cancelQueued(appointment.id);
    if (appointment.status === "no_show") {
      queueMessage({ kind: "missed_appointment", patientId: appointment.patientId, appointmentId: appointment.id, startsAt: appointment.startsAt, dentistId: appointment.dentistId, sendAt: new Date().toISOString() });
    }
    persist();
    return HttpResponse.json(appointment);
  }),
];
