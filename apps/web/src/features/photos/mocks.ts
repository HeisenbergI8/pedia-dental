import { http, HttpResponse, delay } from "msw";
import { UploadPhotoInput, roleCan, type ClinicalPhoto, type PhotoType } from "@pedia/shared";
import { env } from "@/lib/env";
import { inScope, sessionOf } from "@/mocks/access";
import { getBlob, putBlob } from "@/mocks/blob-store";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;
const MAX_BYTES = 10 * 1024 * 1024;
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

  // multipart/form-data: `file` (an image) and `meta` (UploadPhotoInput as JSON).
  http.post(url("/patients/:id/photos"), async ({ params, request }) => {
    if (!db.patients.some((p) => p.id === params.id)) return new HttpResponse("Patient not found", { status: 404 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
      return new HttpResponse("Attach an image file", { status: 400 });
    }
    if (file.size > MAX_BYTES) return new HttpResponse("Images must be under 10 MB", { status: 413 });
    let meta: unknown;
    try {
      meta = JSON.parse(String(form.get("meta")));
    } catch {
      return new HttpResponse("`meta` must be JSON", { status: 400 });
    }
    const parsed = UploadPhotoInput.safeParse(meta);
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const session = sessionOf(request);
    const fromParent = !(session && roleCan(session.role, "clinical.write"));
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
      clinicId: CLINIC_ID,
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
    return new HttpResponse(blob, { headers: { "Content-Type": photo.contentType, "Content-Disposition": `inline; filename="${name}.jpg"` } });
  }),
];
