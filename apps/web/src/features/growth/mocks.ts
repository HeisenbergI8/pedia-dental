import { http, HttpResponse, delay } from "msw";
import { SaveGrowthInput, type GrowthRecord } from "@pedia/shared";
import { env } from "@/lib/env";
import { currentClinicId, db, persist } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's GrowthController. One record per visit. */
export const growthHandlers = [
  http.get(url("/patients/:id/growth"), async ({ params }) => {
    await delay(100);
    const rows = db.growth
      .filter((g) => g.patientId === params.id)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    return HttpResponse.json(rows);
  }),

  /** Creates or replaces the record for this visit. */
  http.put(url("/visits/:id/growth"), async ({ params, request }) => {
    const visit = db.visits.find((v) => v.id === params.id);
    if (!visit) return new HttpResponse("Visit not found", { status: 404 });
    if (visit.status !== "in_progress") {
      return new HttpResponse("Growth is recorded during a visit in progress", { status: 409 });
    }
    const parsed = SaveGrowthInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });

    const existing = db.growth.find((g) => g.visitId === visit.id);
    const record: GrowthRecord = {
      ...parsed.data,
      id: existing?.id ?? crypto.randomUUID(),
      clinicId: currentClinicId(),
      patientId: visit.patientId,
      visitId: visit.id,
      recordedAt: new Date().toISOString(),
    };
    db.growth = [...db.growth.filter((g) => g.visitId !== visit.id), record];
    persist();
    return HttpResponse.json(record);
  }),
];
