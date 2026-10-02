import { http, HttpResponse, delay } from "msw";
import { CreatePatientInput, type Patient } from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

/**
 * These handlers are the API contract for apps/api's PatientsController.
 * Same paths, same request and response shapes.
 */
export const patientHandlers = [
  http.get(url("/patients"), async ({ request }) => {
    await delay(150);
    const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
    const rows = db.patients
      .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((a, b) => a.lastName.localeCompare(b.lastName));
    return HttpResponse.json(rows);
  }),

  http.get(url("/patients/:id"), async ({ params }) => {
    await delay(100);
    const patient = db.patients.find((p) => p.id === params.id);
    return patient ? HttpResponse.json(patient) : new HttpResponse("Patient not found", { status: 404 });
  }),

  http.post(url("/patients"), async ({ request }) => {
    const parsed = CreatePatientInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const patient: Patient = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      createdAt: new Date().toISOString(),
    };
    db.patients.push(patient);
    persist();
    return HttpResponse.json(patient, { status: 201 });
  }),
];
