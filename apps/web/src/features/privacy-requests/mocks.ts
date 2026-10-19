import { http, HttpResponse, delay } from "msw";
import {
  ClosePrivacyRequestInput, LogPrivacyRequestInput, PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT, PrivacyRequest, PrivacyRequestPage,
  PrivacyRequestQuery, addWorkingDays, readRequestCursor, requestCursor, type AppointmentStatus, type PrivacyRequest as Request,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { recordAudit, sessionOf, type MockSession } from "@/mocks/access";
import { today } from "@/mocks/clock";
import { currentClinicId, db, persist } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;
const served = (r: Request) => {
  const p = r.patientId ? db.patients.find((x) => x.id === r.patientId) : undefined;
  return PrivacyRequest.parse({ ...r, ...(p && { patientName: `${p.firstName} ${p.lastName}` }) });
};
/** The API's UPCOMING (appointment-records.service.ts): what blocks approving an erasure (E7). */
const UPCOMING: AppointmentStatus[] = ["booked", "confirmed", "arrived", "in_chair"];

/**
 * B13c2b: the register (the API's PrivacyRequestsService). The gate checks privacy.manage and logs first. The deadline
 * uses the shared default (E3): MSW has no PRIVACY_REQUEST_DUE_WORKING_DAYS.
 */
export const privacyRequestHandlers = [
  http.get(url("/privacy-requests"), async ({ request }) => {
    await delay(100);
    const parsed = PrivacyRequestQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const q = parsed.data;
    const after = q.before ? readRequestCursor(q.before) : undefined;
    if (q.before && !after) return new HttpResponse("This page link has expired. Reload the requests.", { status: 400 });
    if (q.status === "open") {
      const open = db.privacyRequests.filter((r) => r.status === "open").sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
      return HttpResponse.json(PrivacyRequestPage.parse({ requests: open.map(served) }));
    }
    const closed = db.privacyRequests
      .filter((r) => r.status !== "open" && (!after || r.closedAt! < after.at || (r.closedAt === after.at && r.id < after.id)))
      .sort((a, b) => b.closedAt!.localeCompare(a.closedAt!) || b.id.localeCompare(a.id));
    const page = closed.slice(0, q.limit).map(served);
    return HttpResponse.json(PrivacyRequestPage.parse({ requests: page, ...(closed.length > q.limit && { next: requestCursor(page.at(-1)!) }) }));
  }),

  http.post(url("/privacy-requests"), async ({ request }) => {
    const parsed = LogPrivacyRequestInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const input = parsed.data;
    if (input.receivedOn > today()) return new HttpResponse("The day it was received can't be after today", { status: 409 });
    if (input.patientId && !db.patients.some((p) => p.id === input.patientId)) return new HttpResponse("Patient not found", { status: 404 });
    const row: Request = {
      id: crypto.randomUUID(), clinicId: currentClinicId(), kind: input.kind, requesterName: input.requesterName, channel: input.channel,
      receivedOn: input.receivedOn, dueOn: addWorkingDays(input.receivedOn, PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT), status: "open",
      loggedByName: sessionOf(request)!.name, loggedAt: new Date().toISOString(),
      ...(input.patientId && { patientId: input.patientId }),
      ...(input.relationship && { relationship: input.relationship }),
      ...(input.details && { details: input.details }),
    };
    db.privacyRequests.push(row);
    persist();
    return HttpResponse.json(served(row), { status: 201 });
  }),

  http.post(url("/privacy-requests/:id/close"), async ({ params, request }) => {
    const row = db.privacyRequests.find((r) => r.id === params.id);
    if (!row) return new HttpResponse("This request no longer exists.", { status: 404 });
    const parsed = ClosePrivacyRequestInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (row.status !== "open") return new HttpResponse("This request is already closed", { status: 409 });
    const session = sessionOf(request)!;
    if (row.kind === "erasure" && parsed.data.status === "done") {
      const refused = restrict(row.patientId!, session);
      if (refused) return new HttpResponse(refused, { status: 409 });
    }
    Object.assign(row, { status: parsed.data.status, outcome: parsed.data.outcome, closedByName: session.name, closedAt: new Date().toISOString() });
    persist();
    return HttpResponse.json(served(row));
  }),
];

/** E5–E7, as the API's PrivacyRequestsService.restrict: refused while busy; else restricted, choices "no", texts withdrawn. */
function restrict(patientId: string, session: MockSession): string | undefined {
  const p = db.patients.find((x) => x.id === patientId)!;
  if (p.restrictedAt) return undefined;
  const now = new Date().toISOString();
  if (db.appointments.some((a) => a.patientId === patientId && a.startsAt >= now && UPCOMING.includes(a.status))) {
    return `Cancel ${p.firstName}'s upcoming appointments first`;
  }
  if (db.appointmentRequests.some((r) => r.patientId === patientId && r.status === "pending")) return `Handle ${p.firstName}'s appointment request first`;
  p.restrictedAt = now;
  p.privacyChoices = [...(p.privacyChoices ?? []), { photos: false, reminders: false, by: "staff", byName: session.name, at: now }];
  // As a reminders "no" (features/patients/mocks.ts, privacy #14): what is queued and not yet sent is withdrawn.
  for (const m of db.messages) if (m.patientId === patientId && m.status === "queued") m.status = "cancelled";
  recordAudit(session, "update", "Privacy consent (changed)", patientId);
  recordAudit(session, "update", "Patient record (restricted)", patientId);
  return undefined;
}
