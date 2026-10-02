import { http, HttpResponse, delay } from "msw";
import { UploadPhotoInput, type ClinicalPhoto } from "@pedia/shared";
import { env } from "@/lib/env";
import { getBlob, putBlob } from "@/mocks/blob-store";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;
const MAX_BYTES = 10 * 1024 * 1024;

/** API contract for apps/api's PhotosController. */
export const photoHandlers = [
  // Newest first.
  http.get(url("/patients/:id/photos"), async ({ params }) => {
    await delay(100);
    const rows = db.photos
      .filter((p) => p.patientId === params.id)
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
      createdAt: new Date().toISOString(),
    };
    await putBlob(photo.id, file);
    db.photos.push(photo);
    persist();
    return HttpResponse.json(photo, { status: 201 });
  }),

  http.get(url("/photos/:id/file"), async ({ params }) => {
    const photo = db.photos.find((p) => p.id === params.id);
    const blob = photo && (await getBlob(photo.id));
    if (!photo || !blob) return new HttpResponse("Photo not found", { status: 404 });
    return new HttpResponse(blob, { headers: { "Content-Type": photo.contentType } });
  }),
];
