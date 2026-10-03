import { http, HttpResponse, delay } from "msw";
import { AddConsentInput, CreatePatientInput, type Patient } from "@pedia/shared";
import { env } from "@/lib/env";
import { inScope, sessionOf } from "@/mocks/access";
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
    const session = sessionOf(request);
    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
    // Front desk looks a child up by the child's or a guardian's name, or a guardian's phone.
    // Every word must match somewhere, so "Balistreri Carmel" and "0917 123 4567" both work.
    const words = q.split(/\s+/).filter(Boolean);
    const matches = (p: Patient) => {
      const names = [`${p.firstName} ${p.lastName}`, ...p.guardians.map((g) => g.fullName)].join(" ").toLowerCase();
      const phones = p.guardians.map((g) => g.phone.replace(/\D/g, "")).join(" ");
      // A word made of digits and phone punctuation (0917-123-4567, +63) is matched on its digits.
      const isPhone = (w: string) => /^[\d()+-]+$/.test(w) && /\d/.test(w);
      return words.every((w) => names.includes(w) || (isPhone(w) && phones.includes(w.replace(/\D/g, ""))));
    };
    const rows = db.patients
      .filter((p) => inScope(session, "patients.view", p.id) && matches(p)) // a parent: their children only
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
      consents: [],
      createdAt: new Date().toISOString(),
    };
    db.patients.push(patient);
    persist();
    return HttpResponse.json(patient, { status: 201 });
  }),

  http.put(url("/patients/:id"), async ({ params, request }) => {
    const index = db.patients.findIndex((p) => p.id === params.id);
    if (index < 0) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = CreatePatientInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });

    const current = db.patients[index];
    const guardianIds = new Set(parsed.data.guardians.map((g) => g.id));
    if (current.consents.some((c) => !guardianIds.has(c.guardianId))) {
      return new HttpResponse("A guardian who signed a consent can't be removed", { status: 409 });
    }
    const patient: Patient = { ...current, ...parsed.data };
    db.patients[index] = patient;
    persist();
    return HttpResponse.json(patient);
  }),

  http.post(url("/patients/:id/consents"), async ({ params, request }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = AddConsentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!patient.guardians.some((g) => g.id === parsed.data.guardianId)) {
      return new HttpResponse("Guardian does not belong to this patient", { status: 400 });
    }
    patient.consents.push({ ...parsed.data, id: crypto.randomUUID() });
    persist();
    return HttpResponse.json(patient, { status: 201 });
  }),
];
