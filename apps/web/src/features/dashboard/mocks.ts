import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import { financeSummary } from "@pedia/shared";
import { env } from "@/lib/env";
import { db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's ReportsController. Computed on every request; no totals are stored. */
export const dashboardHandlers = [
  // ?today=YYYY-MM-DD (the clinic's local day; defaults to now).
  http.get(url("/reports/finance"), async ({ request }) => {
    await delay(100);
    const today = new URL(request.url).searchParams.get("today") ?? format(new Date(), "yyyy-MM-dd");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return new HttpResponse("today must be YYYY-MM-DD", { status: 400 });
    return HttpResponse.json(financeSummary(db, today));
  }),
];
