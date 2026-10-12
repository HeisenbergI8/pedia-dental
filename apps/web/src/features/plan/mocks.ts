import { http, HttpResponse, delay } from "msw";
import { AddPlanItemInput, SetPlanItemStatusInput, type PlanItem } from "@pedia/shared";
import { env } from "@/lib/env";
import { currentClinicId, db, persist } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's TreatmentPlanController. Items are completed by signing a note (notes/mocks.ts). */
export const planHandlers = [
  http.get(url("/patients/:id/plan"), async ({ params }) => {
    await delay(100);
    const rows = db.planItems
      .filter((i) => i.patientId === params.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return HttpResponse.json(rows);
  }),

  http.post(url("/patients/:id/plan"), async ({ params, request }) => {
    if (!db.patients.some((p) => p.id === params.id)) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = AddPlanItemInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const procedure = db.procedures.find((p) => p.code === parsed.data.procedureCode);
    if (!procedure) return new HttpResponse("Unknown procedure", { status: 400 });
    if (procedure.perTooth && parsed.data.tooth === undefined) {
      return new HttpResponse(`${procedure.name} is planned per tooth`, { status: 400 });
    }

    const item: PlanItem = {
      ...parsed.data,
      id: crypto.randomUUID(),
      clinicId: currentClinicId(),
      patientId: String(params.id),
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    db.planItems.push(item);
    persist();
    return HttpResponse.json(item, { status: 201 });
  }),

  http.patch(url("/plan-items/:id"), async ({ params, request }) => {
    const item = db.planItems.find((i) => i.id === params.id);
    if (!item) return new HttpResponse("Plan item not found", { status: 404 });
    if (item.status === "done") return new HttpResponse("A completed item can't change", { status: 409 });
    const parsed = SetPlanItemStatusInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    item.status = parsed.data.status;
    persist();
    return HttpResponse.json(item);
  }),
];
