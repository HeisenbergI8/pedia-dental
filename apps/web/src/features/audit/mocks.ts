import { http, HttpResponse, delay } from "msw";
import { AuditLogPage, AuditLogQuery, auditCursor, readAuditCursor } from "@pedia/shared";
import { env } from "@/lib/env";
import { db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** B13c2a: GET /audit-log (the API's AuditService.page). The gate checks audit.view and logs "Audit log" first. */
export const auditHandlers = [
  http.get(url("/audit-log"), async ({ request }) => {
    await delay(100);
    const parsed = AuditLogQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const q = parsed.data;
    const after = q.before ? readAuditCursor(q.before) : undefined;
    if (q.before && !after) return new HttpResponse("This page link has expired. Reload the audit log.", { status: 400 });
    const newestFirst = (a: { at: string; id: string }, b: { at: string; id: string }) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id);
    const rows = db.auditEvents
      .filter((e) => (!q.action || e.action === q.action) && (!q.actorId || e.actorId === q.actorId) && (!q.patientId || e.patientId === q.patientId))
      .filter((e) => !after || e.at < after.at || (e.at === after.at && e.id < after.id))
      .sort(newestFirst);
    const page = rows.slice(0, q.limit);
    const name = (id?: string) => db.patients.find((p) => p.id === id);
    return HttpResponse.json(
      AuditLogPage.parse({
        entries: page.map((e) => {
          const p = name(e.patientId);
          return { ...e, ...(p && { patientName: `${p.firstName} ${p.lastName}` }) };
        }),
        ...(rows.length > q.limit && { next: auditCursor(page[page.length - 1]!) }),
      }),
    );
  }),
];
