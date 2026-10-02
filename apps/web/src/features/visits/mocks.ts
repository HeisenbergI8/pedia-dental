import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import { StartVisitInput, type Visit } from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's VisitsController. */
export const visitHandlers = [
  http.get(url("/patients/:id/visits"), async ({ params }) => {
    await delay(100);
    const rows = db.visits
      .filter((v) => v.patientId === params.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return HttpResponse.json(rows);
  }),

  http.post(url("/patients/:id/visits"), async ({ params, request }) => {
    if (!db.patients.some((p) => p.id === params.id)) {
      return new HttpResponse("Patient not found", { status: 404 });
    }
    const parsed = StartVisitInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!db.staff.some((s) => s.id === parsed.data.dentistId && s.role === "dentist")) {
      return new HttpResponse("Unknown dentist", { status: 400 });
    }
    if (db.visits.some((v) => v.patientId === params.id && v.status === "in_progress")) {
      return new HttpResponse("This patient already has a visit in progress", { status: 409 });
    }
    const now = new Date();
    const visit: Visit = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: String(params.id),
      date: format(now, "yyyy-MM-dd"), // the clinic's calendar day, not UTC's
      status: "in_progress",
      startedAt: now.toISOString(),
    };
    db.visits.push(visit);
    persist();
    return HttpResponse.json(visit, { status: 201 });
  }),

  http.post(url("/visits/:id/complete"), async ({ params }) => {
    const visit = db.visits.find((v) => v.id === params.id);
    if (!visit) return new HttpResponse("Visit not found", { status: 404 });
    if (visit.status !== "in_progress") return new HttpResponse("Visit is already completed", { status: 409 });
    visit.status = "completed";
    visit.completedAt = new Date().toISOString();
    persist();
    return HttpResponse.json(visit);
  }),
];
