import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import { financeSummary, todaySummary } from "@pedia/shared";
import { env } from "@/lib/env";
import { activeBranch } from "@/mocks/access";
import { db, type Db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's ReportsController. Computed on every request; no totals are stored. */
const dayParam = (request: Request) => new URL(request.url).searchParams.get("today") ?? format(new Date(), "yyyy-MM-dd");
const isDay = (today: string) => /^\d{4}-\d{2}-\d{2}$/.test(today);
const badDay = () => new HttpResponse("today must be YYYY-MM-DD", { status: 400 });

/**
 * One branch's share of the account, for the branch-level reports: its appointments, invoices and payments, with
 * every account-level collection (patients, staff, visits) as is. The Owner's "All branches" total comes later.
 */
const branchView = (all: Db, branchId: string): Db => ({
  ...all,
  appointments: all.appointments.filter((a) => a.branchId === branchId),
  invoices: all.invoices.filter((i) => i.branchId === branchId),
  payments: all.payments.filter((p) => p.branchId === branchId),
});

export const dashboardHandlers = [
  // ?today=YYYY-MM-DD (the clinic's local day; defaults to now).
  http.get(url("/reports/finance"), async ({ request }) => {
    await delay(100);
    const today = dayParam(request);
    if (!isDay(today)) return badDay();
    return HttpResponse.json(financeSummary(branchView(db, activeBranch(request).id), today));
  }),

  // Today at a glance, for every staff role. Same ?today= rule. The birthday job is NOT run here: opening
  // the dashboard must not send texts as a side effect.
  http.get(url("/reports/today"), async ({ request }) => {
    await delay(100);
    const today = dayParam(request);
    if (!isDay(today)) return badDay();
    return HttpResponse.json(todaySummary(branchView(db, activeBranch(request).id), today));
  }),
];
