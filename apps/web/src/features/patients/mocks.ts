import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import {
  AddConsentInput,
  CreatePatientInput,
  EditPatientWithoutContactsInput,
  PatientFilter,
  PatientListQuery,
  QuickUpdatePatientInput,
  accountCredit,
  accountSummary,
  comparePatients,
  findDuplicates,
  isReservedTag,
  lastVisitOn,
  matchesFilter,
  matchesSearch,
  nextPatientNo,
  normalizeName,
  paginate,
  patientStanding,
  roleCan,
  type Patient,
  type PatientSummary,
  type PatientView,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { inScope, sessionOf, type MockSession } from "@/mocks/access";
import { deleteBlob, getBlob, putBlob } from "@/mocks/blob-store";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

/** Names are stored tidied, so lists sort and duplicates match the way staff expect. */
const tidy = <T extends { firstName: string; lastName: string }>(p: T): T => ({
  ...p,
  firstName: normalizeName(p.firstName),
  lastName: normalizeName(p.lastName),
});
const reservedTag = (tags: string[] | undefined) => tags?.find(isReservedTag);
const refuseTag = (tag: string) => new HttpResponse(`"${tag}" is worked out from the record, so it can't be a tag`, { status: 400 });

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const photoKey = (patientId: string) => `patient-photo:${patientId}`;

/**
 * A patient as this caller may see them: guardian phones and emails, the emergency contact and the address only with
 * patients.contact (front desk, admin; a parent for their own children). The stored record is never changed; JSON
 * drops the undefined keys. NestJS: the response DTO's serialisation group, applied to every endpoint returning a patient.
 */
const visibleTo = (session: MockSession | undefined, p: Patient): PatientView =>
  inScope(session, "patients.contact", p.id)
    ? p
    : { ...p, address: undefined, emergencyContact: undefined, guardians: p.guardians.map((g) => ({ ...g, phone: undefined, email: undefined })) };

/**
 * Children sharing a guardian phone with `p` (one family), limited to those this caller may see. Phones stay on the
 * server: the list sends first names, the header summary ids and first names. O(n²) over ~60 seeded patients;
 * NestJS would query by guardian.
 */
function siblingsOf(session: MockSession | undefined, p: Patient): Patient[] {
  const phones = new Set(p.guardians.map((g) => g.phone));
  return db.patients.filter((x) => x.id !== p.id && x.guardians.some((g) => phones.has(g.phone)) && inScope(session, "patients.view", x.id));
}

/**
 * These handlers are the API contract for apps/api's PatientsController.
 * Same paths, same request and response shapes.
 */
export const patientHandlers = [
  http.get(url("/patients"), async ({ request }) => {
    await delay(150);
    const session = sessionOf(request);
    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
    const rows = db.patients
      // The directory (⌘K search, pickers): child or guardian name, or a guardian's phone for those who may see phones.
      // A parent: their children only.
      .filter((p) => inScope(session, "patients.view", p.id) && matchesSearch(p, q, { phones: !!session && roleCan(session.role, "patients.contact") }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
      .map((p) => visibleTo(session, p));
    return HttpResponse.json(rows);
  }),

  // The patient list: search, one filter, one sort, one page. Every flag is computed now from the same
  // sources as /recall (due items) and the dashboard (accountSummary). ?today= for tests; defaults to now.
  http.get(url("/patient-summaries"), async ({ request }) => {
    await delay(150);
    const session = sessionOf(request)!; // the gate already answered 401 without one
    const params = new URL(request.url).searchParams;
    const query = PatientListQuery.parse(Object.fromEntries(params));
    const today = params.get("today") ?? format(new Date(), "yyyy-MM-dd");
    const contact = roleCan(session.role, "patients.contact"); // phone search
    const money = roleCan(session.role, "billing.view");

    const all = db.patients
      .filter((p) => inScope(session, "patients.view", p.id) && matchesSearch(p, query.q, { phones: contact }))
      .map((p): PatientSummary => {
        const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0];
        const s = patientStanding(p.id, db, today);
        return {
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          birthDate: p.birthDate,
          allergies: p.allergies,
          medicalConditions: p.medicalConditions,
          alerts: p.alerts,
          guardianName: g.fullName,
          ...(inScope(session, "patients.contact", p.id) && { guardianPhone: g.phone }),
          siblings: siblingsOf(session, p).map((x) => x.firstName),
          lastVisitOn: s.lastVisitOn,
          ...(money && { balance: s.balance }),
          recallDueOn: s.recallDueOn,
          flags: s.flags,
        };
      });
    const counts = Object.fromEntries(
      PatientFilter.options.map((f) => [f, all.filter((r) => matchesFilter(f, r, today)).length]),
    ) as Record<PatientFilter, number>;
    // Sorting by balance would leak the order to a caller without billing.view, so it falls back to name.
    const sort = query.sort === "balance" && !money ? "name" : query.sort;
    const filtered = all.filter((r) => matchesFilter(query.filter, r, today)).sort(comparePatients(sort));
    return HttpResponse.json({ ...paginate(filtered, query.page, query.pageSize), counts });
  }),

  http.get(url("/patients/:id"), async ({ params, request }) => {
    await delay(100);
    const patient = db.patients.find((p) => p.id === params.id);
    return patient ? HttpResponse.json(visibleTo(sessionOf(request), patient)) : new HttpResponse("Patient not found", { status: 404 });
  }),

  http.post(url("/patients"), async ({ request }) => {
    const parsed = CreatePatientInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const reserved = reservedTag(parsed.data.tags);
    if (reserved) return refuseTag(reserved);
    const patient: Patient = {
      ...tidy(parsed.data),
      id: crypto.randomUUID(),
      patientNo: nextPatientNo(db.patients),
      clinicId: CLINIC_ID,
      consents: [],
      createdAt: new Date().toISOString(),
    };
    db.patients.push(patient);
    persist();
    return HttpResponse.json(visibleTo(sessionOf(request), patient), { status: 201 });
  }),

  http.put(url("/patients/:id"), async ({ params, request }) => {
    const index = db.patients.findIndex((p) => p.id === params.id);
    if (index < 0) return new HttpResponse("Patient not found", { status: 404 });
    const current = db.patients[index];
    const session = sessionOf(request);
    const body: unknown = await request.json();
    let input: CreatePatientInput;
    if (inScope(session, "patients.contact", current.id)) {
      const parsed = CreatePatientInput.safeParse(body);
      if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
      input = parsed.data;
    } else {
      // Never sent the contacts, so they aren't in the input (extra keys are stripped): keep the stored ones.
      const parsed = EditPatientWithoutContactsInput.safeParse(body);
      if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
      const stored = new Map(current.guardians.map((g) => [g.id, g]));
      if (parsed.data.guardians.some((g) => !stored.has(g.id))) {
        return new HttpResponse("Only front desk and admin can add a guardian", { status: 403 });
      }
      input = {
        ...parsed.data,
        address: current.address,
        emergencyContact: current.emergencyContact,
        guardians: parsed.data.guardians.map((g) => ({ ...g, phone: stored.get(g.id)!.phone, email: stored.get(g.id)!.email })),
      };
    }
    const reserved = reservedTag(input.tags);
    if (reserved) return refuseTag(reserved);

    const guardianIds = new Set(input.guardians.map((g) => g.id));
    if (current.consents.some((c) => !guardianIds.has(c.guardianId))) {
      return new HttpResponse("A guardian who signed a consent can't be removed", { status: 409 });
    }
    // patientNo and photoUpdatedAt aren't in the input, so the spread keeps the server's values.
    const patient: Patient = { ...current, ...tidy(input) };
    db.patients[index] = patient;
    persist();
    return HttpResponse.json(visibleTo(session, patient));
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
    return HttpResponse.json(visibleTo(sessionOf(request), patient), { status: 201 });
  }),

  // Quick update: phone, nickname, tags and alerts without the full form.
  http.patch(url("/patients/:id"), async ({ params, request }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = QuickUpdatePatientInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const reserved = reservedTag(parsed.data.tags);
    if (reserved) return refuseTag(reserved);

    // Contact details are patients.contact only (admin, front desk), enforced here, not just hidden.
    const session = sessionOf(request);
    const { phone } = parsed.data;
    if (phone !== undefined) {
      if (!inScope(session, "patients.contact", patient.id)) {
        return new HttpResponse("Only front desk and admin can change contact details", { status: 403 });
      }
      const primary = patient.guardians.find((g) => g.isPrimary) ?? patient.guardians[0];
      // One guardian, one phone: siblings share the guardian id, so they all get the new number.
      for (const g of db.patients.flatMap((p) => p.guardians)) if (g.id === primary.id) g.phone = phone;
    }
    patient.nickname = parsed.data.nickname || undefined;
    patient.tags = parsed.data.tags;
    patient.alerts = parsed.data.alerts;
    persist();
    return HttpResponse.json(visibleTo(session, patient));
  }),

  // Before creating: is this child already registered (same normalised name and birth date)? A warning, not a block.
  // The response is DuplicateMatch only: id, number, names, birth date. Never guardians or phones.
  http.get(url("/patient-duplicates"), async ({ request }) => {
    await delay(100);
    const q = new URL(request.url).searchParams;
    const candidate = { firstName: q.get("firstName") ?? "", lastName: q.get("lastName") ?? "", birthDate: q.get("birthDate") ?? "" };
    const rows = findDuplicates(candidate, db.patients).map(({ id, patientNo, firstName, lastName, birthDate }) => ({
      id,
      patientNo,
      firstName,
      lastName,
      birthDate,
    }));
    return HttpResponse.json(rows);
  }),

  // The pinned header's facts in one request: the same last-visit and balance rules as the patient list.
  http.get(url("/patients/:id/summary"), async ({ params, request }) => {
    await delay(80);
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const session = sessionOf(request);
    const money = inScope(session, "billing.view", patient.id);
    const invoices = db.invoices.filter((i) => i.patientId === patient.id);
    return HttpResponse.json({
      patientId: patient.id,
      patientNo: patient.patientNo,
      lastVisitOn: lastVisitOn(patient.id, db.visits, db.appointments),
      ...(money && { balance: accountSummary(invoices, db.payments).balance, credit: accountCredit(invoices, db.payments) }),
      siblings: siblingsOf(session, patient).map(({ id, firstName }) => ({ id, firstName })),
    });
  }),

  // multipart/form-data with one `file`: the child's photo, already downscaled by the client.
  http.put(url("/patients/:id/photo"), async ({ params, request }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof Blob) || !file.type.startsWith("image/")) return new HttpResponse("Attach an image file", { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) return new HttpResponse("Images must be under 10 MB", { status: 413 });
    await putBlob(photoKey(patient.id), file);
    patient.photoUpdatedAt = new Date().toISOString();
    persist();
    return HttpResponse.json(visibleTo(sessionOf(request), patient));
  }),

  http.get(url("/patients/:id/photo"), async ({ params }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    const blob = patient?.photoUpdatedAt && (await getBlob(photoKey(patient.id)));
    if (!patient || !blob) return new HttpResponse("No photo", { status: 404 });
    // A readable name if someone saves it, never the record id (no hashed file names).
    const name = `${patient.lastName}-${patient.firstName}-photo.jpg`.replace(/[^\w.-]+/g, "-").toLowerCase();
    return new HttpResponse(blob, { headers: { "Content-Type": blob.type || "image/jpeg", "Content-Disposition": `inline; filename="${name}"` } });
  }),

  http.delete(url("/patients/:id/photo"), async ({ params, request }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    await deleteBlob(photoKey(patient.id));
    patient.photoUpdatedAt = undefined;
    persist();
    return HttpResponse.json(visibleTo(sessionOf(request), patient));
  }),

];
