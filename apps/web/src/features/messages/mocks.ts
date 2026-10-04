import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import { MessageStatus, UpdateMessageTemplateInput, birthdayGreeting, isBirthdayOn, isDueItemOpen } from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { queueMessage, runDailyJobs } from "@/mocks/outbox";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's MessagesController. Messages are queued by events (mocks/outbox.ts), never sent. */
export const messageHandlers = [
  http.get(url("/message-templates"), async () => {
    await delay(100);
    return HttpResponse.json(db.messageTemplates);
  }),

  http.put(url("/message-templates/:kind"), async ({ params, request }) => {
    const template = db.messageTemplates.find((t) => t.kind === params.kind);
    if (!template) return new HttpResponse("Template not found", { status: 404 });
    const parsed = UpdateMessageTemplateInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    Object.assign(template, parsed.data, { updatedAt: new Date().toISOString() });
    persist();
    return HttpResponse.json(template);
  }),

  // The log, newest send time first. ?patientId= and ?status= narrow it.
  http.get(url("/messages"), async ({ request }) => {
    await delay(100);
    if (runDailyJobs()) persist(); // stands in for the daily cron (birthdays)
    const params = new URL(request.url).searchParams;
    const status = MessageStatus.safeParse(params.get("status"));
    const patientId = params.get("patientId");
    const rows = db.messages.filter((m) => (!patientId || m.patientId === patientId) && (!status.success || m.status === status.data));
    return HttpResponse.json(rows.sort((a, b) => b.sendAt.localeCompare(a.sendAt)));
  }),

  // Feature 14's "recall message": one tap from the due list.
  http.post(url("/due-items/:id/message"), async ({ params }) => {
    const item = db.dueItems.find((i) => i.id === params.id);
    if (!item) return new HttpResponse("Due item not found", { status: 404 });
    if (!isDueItemOpen(item, db.appointments)) return new HttpResponse("This is already booked", { status: 409 });
    if (db.messages.some((m) => m.dueItemId === item.id && m.status === "queued")) {
      return new HttpResponse("A reminder is already queued for this", { status: 409 });
    }
    const kind = item.kind === "follow_up" ? "follow_up_reminder" : "recall";
    const message = queueMessage({ kind, patientId: item.patientId, dueItemId: item.id, dueOn: item.dueOn, sendAt: new Date().toISOString() });
    if (!message) return new HttpResponse("This patient has no primary guardian to message", { status: 409 });
    persist();
    return HttpResponse.json(message, { status: 201 });
  }),

  // "Send greeting" on the dashboard: the birthday template, now, once a year (the daily job's rule).
  http.post(url("/patients/:id/birthday-greeting"), async ({ params }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const today = format(new Date(), "yyyy-MM-dd");
    if (!isBirthdayOn(patient.birthDate, today)) return new HttpResponse(`It isn't ${patient.firstName}'s birthday today`, { status: 409 });
    if (birthdayGreeting(db.messages, patient.id, today)) {
      return new HttpResponse(`${patient.firstName} already has a birthday greeting this year`, { status: 409 });
    }
    const message = queueMessage({ kind: "birthday", patientId: patient.id, sendAt: new Date().toISOString() });
    if (!message) return new HttpResponse("This patient has no primary guardian to message", { status: 409 });
    persist();
    return HttpResponse.json(message, { status: 201 });
  }),
];
