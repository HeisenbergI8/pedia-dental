import { http, HttpResponse, delay } from "msw";
import { CreateChartBatchInput, CreateChartEntryInput, deriveChart, isToothGone, surfacesFor, type ChartEntry } from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's ChartController. Entries are append-only; the chart is derived client-side. */
export const chartHandlers = [
  http.get(url("/patients/:id/chart"), async ({ params }) => {
    await delay(100);
    const rows = db.chartEntries
      .filter((e) => e.patientId === params.id)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    return HttpResponse.json(rows);
  }),

  http.post(url("/patients/:id/chart"), async ({ params, request }) => {
    const parsed = CreateChartEntryInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const input = parsed.data;

    const visit = db.visits.find((v) => v.id === input.visitId && v.patientId === params.id);
    if (!visit) return new HttpResponse("Visit not found for this patient", { status: 404 });
    if (visit.status !== "in_progress") {
      return new HttpResponse("Findings can only be recorded during a visit in progress", { status: 409 });
    }
    if (!input.surfaces.every((s) => surfacesFor(input.tooth).includes(s))) {
      return new HttpResponse(`Tooth ${input.tooth} has no such surface`, { status: 400 });
    }
    const patientEntries = db.chartEntries.filter((e) => e.patientId === params.id);
    if (!input.supersedes && isToothGone(deriveChart(patientEntries).get(input.tooth))) {
      return new HttpResponse(`Tooth ${input.tooth} is recorded as extracted or missing. Correct that entry instead`, {
        status: 409,
      });
    }
    if (input.supersedes) {
      const original = db.chartEntries.find((e) => e.id === input.supersedes && e.patientId === params.id);
      if (!original || original.tooth !== input.tooth) {
        return new HttpResponse("A correction must replace an entry on the same tooth", { status: 400 });
      }
      if (db.chartEntries.some((e) => e.supersedes === original.id)) {
        return new HttpResponse("That entry has already been corrected", { status: 409 });
      }
    }

    const entry: ChartEntry = {
      ...input,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: String(params.id),
      recordedBy: visit.dentistId,
      recordedAt: new Date().toISOString(),
    };
    db.chartEntries.push(entry);
    persist();
    return HttpResponse.json(entry, { status: 201 });
  }),

  // One finding on several teeth. Every tooth is checked first and nothing is written on any failure, so a
  // finding never lands on some of the picked teeth but not others.
  http.post(url("/patients/:id/chart/batch"), async ({ params, request }) => {
    const parsed = CreateChartBatchInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { teeth, ...finding } = parsed.data;

    const visit = db.visits.find((v) => v.id === finding.visitId && v.patientId === params.id);
    if (!visit) return new HttpResponse("Visit not found for this patient", { status: 404 });
    if (visit.status !== "in_progress") return new HttpResponse("Findings can only be recorded during a visit in progress", { status: 409 });
    const chart = deriveChart(db.chartEntries.filter((e) => e.patientId === params.id));
    const gone = teeth.filter((t) => isToothGone(chart.get(t)));
    if (gone.length) {
      return new HttpResponse(`Tooth ${gone.join(", ")} is recorded as extracted or missing. Unpick it, or correct that entry`, { status: 409 });
    }

    const recordedAt = new Date().toISOString();
    const entries: ChartEntry[] = teeth.map((tooth) => ({
      ...finding,
      tooth,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: String(params.id),
      recordedBy: visit.dentistId,
      recordedAt,
    }));
    db.chartEntries.push(...entries);
    persist();
    return HttpResponse.json(entries, { status: 201 });
  }),
];
