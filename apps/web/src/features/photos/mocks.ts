import { http, HttpResponse, delay } from "msw";
import { CONSENTED_PHOTO_TYPES, UPLOAD_RULES, UploadPhotoInput, choiceDeclined, isPdf, rolesCan, uploadProblem, type ClinicalPhoto, type PhotoType } from "@pedia/shared";
import { env } from "@/lib/env";
import { inScope, sessionOf } from "@/mocks/access";
import { getBlob, putBlob } from "@/mocks/blob-store";
import { currentClinicId, db, persist } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;
/** What a parent may upload from the portal. Clinical imaging (X-rays) is the clinic's. */
const PARENT_TYPES: PhotoType[] = ["intraoral", "extraoral", "document"];

/** API contract for apps/api's PhotosController. */
export const photoHandlers = [
  // Newest first.
  http.get(url("/patients/:id/photos"), async ({ params, request }) => {
    await delay(100);
    // Without clinical.view (a parent), only what parents uploaded.
    const clinical = inScope(sessionOf(request), "clinical.view", String(params.id));
    const rows = db.photos
      .filter((p) => p.patientId === params.id && (clinical || p.uploadedBy === "parent"))
      .sort((a, b) => b.takenOn.localeCompare(a.takenOn) || b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(rows);
  }),

  // multipart/form-data: `file` (an image, or a PDF for a document or referral) and `meta` (UploadPhotoInput as JSON).
  http.post(url("/patients/:id/photos"), async ({ params, request }) => {
    if (!db.patients.some((p) => p.id === params.id)) return new HttpResponse("Patient not found", { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return new HttpResponse("Attach a file", { status: 400 });
    let meta: unknown;
    try {
      meta = JSON.parse(String(form.get("meta")));
    } catch {
      return new HttpResponse("`meta` must be JSON", { status: 400 });
    }
    const parsed = UploadPhotoInput.safeParse(meta);
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    // The file rule depends on the type (a PDF is fine for a document, not a photo), so it runs after meta.
    const problem = uploadProblem(parsed.data.type, file);
    if (problem) return new HttpResponse(problem, { status: file.size > UPLOAD_RULES.maxBytes ? 413 : 400 });
    // Privacy #14 (P14): a family that declined clinical photos gets none, from staff or from the portal.
    const patient = db.patients.find((p) => p.id === params.id)!;
    if (CONSENTED_PHOTO_TYPES.includes(parsed.data.type) && choiceDeclined(patient, "photos")) {
      return new HttpResponse(
        `${patient.firstName}'s family declined clinical photos. Staff can change this under Privacy on the child's Overview; parents on the portal's Home page.`,
        { status: 409 },
      );
    }
    const session = sessionOf(request);
    const fromParent = !(session && rolesCan(session.roles, "clinical.write"));
    if (fromParent && (!PARENT_TYPES.includes(parsed.data.type) || parsed.data.visitId || parsed.data.stage || parsed.data.tooth)) {
      return new HttpResponse("Upload a photo or a medical document", { status: 400 });
    }
    const { visitId } = parsed.data;
    if (visitId && db.visits.find((v) => v.id === visitId)?.patientId !== params.id) {
      return new HttpResponse("Visit not found", { status: 400 });
    }

    const photo: ClinicalPhoto = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: currentClinicId(),
      patientId: String(params.id),
      contentType: file.type,
      uploadedBy: fromParent ? "parent" : "staff",
      createdAt: new Date().toISOString(),
    };
    await putBlob(photo.id, file);
    db.photos.push(photo);
    persist();
    return HttpResponse.json(photo, { status: 201 });
  }),

  http.get(url("/photos/:id/file"), async ({ params, request }) => {
    const photo = db.photos.find((p) => p.id === params.id);
    if (photo && photo.uploadedBy !== "parent" && !inScope(sessionOf(request), "clinical.view", photo.patientId)) {
      return new HttpResponse("Photo not found", { status: 404 }); // a parent can't open clinical imaging
    }
    const blob = photo && (await getBlob(photo.id));
    if (!photo || !blob) return new HttpResponse("Photo not found", { status: 404 });
    // A readable name if saved, never the record id: "mendoza-bea-intraoral-74-2026-10-02.jpg".
    const patient = db.patients.find((p) => p.id === photo.patientId);
    const name = [patient?.lastName, patient?.firstName, photo.type, photo.tooth, photo.takenOn]
      .filter(Boolean)
      .join("-")
      .replace(/[^\w.-]+/g, "-")
      .toLowerCase();
    const ext = isPdf(photo.contentType) ? "pdf" : "jpg";
    return new HttpResponse(blob, { headers: { "Content-Type": photo.contentType, "Content-Disposition": `inline; filename="${name}.${ext}"` } });
  }),
];
