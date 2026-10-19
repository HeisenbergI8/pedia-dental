import { http, HttpResponse, delay } from "msw";
import { RecordsCopy, copySections, liveInvoices, rolesCan, type RecordsCopySection } from "@pedia/shared";
import { env } from "@/lib/env";
import { inScope, sessionOf } from "@/mocks/access";
import { currentAccount, currentClinicId, db } from "@/mocks/db";
import { visibleTo } from "./mocks";

const url = (p: string) => `${env.apiUrl}${p}`;
const byDate = <T,>(key: (r: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b));

/**
 * B13c2a: POST /patients/:id/exports. Each section filtered as its own handler filters it (a parent's live bills and
 * own uploads, signed notes only); the gate has already checked ownership and written "Copy of records".
 */
export const recordsCopyHandlers = [
  http.post(url("/patients/:id/exports"), async ({ params, request }) => {
    await delay(150);
    const session = sessionOf(request)!; // behind the gate
    const id = String(params.id);
    const patient = db.patients.find((p) => p.id === id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const mine = <T extends { patientId: string }>(rows: T[]) => rows.filter((r) => r.patientId === id);
    const read: Record<RecordsCopySection, () => unknown[]> = {
      visits: () => mine(db.visits),
      chart: () => mine(db.chartEntries).sort(byDate((e) => e.recordedAt)),
      notes: () => mine(db.notes).filter((n) => n.signedAt),
      growth: () => mine(db.growth),
      plan: () => mine(db.planItems),
      appointments: () => mine(db.appointments),
      appointmentRequests: () => mine(db.appointmentRequests),
      invoices: () => (rolesCan(session.roles, "billing.view", "all") ? mine(db.invoices) : liveInvoices(mine(db.invoices))),
      payments: () => mine(db.payments),
      messages: () => mine(db.messages),
      photos: () => mine(db.photos).filter((p) => inScope(session, "clinical.view", id) || p.uploadedBy === "parent"),
      documents: () => mine(db.documents),
    };
    const { included, omitted } = copySections(session.roles);
    return HttpResponse.json(
      RecordsCopy.parse({
        kind: "primolar.records-copy",
        version: 1,
        generatedAt: new Date().toISOString(),
        clinic: { id: currentClinicId(), name: currentAccount().name },
        requestedBy: { name: session.name, role: session.role },
        patient: visibleTo(session, patient),
        ...Object.fromEntries(included.map((s) => [s, read[s]()])),
        omitted,
      }),
    );
  }),
];
