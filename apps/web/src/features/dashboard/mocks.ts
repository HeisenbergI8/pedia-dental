import { http, HttpResponse, delay } from "msw";
import { format } from "date-fns";
import { financeSummary, todaySummary } from "@pedia/shared";
import { env } from "@/lib/env";
import { reportBranches } from "@/mocks/access";
import { db, type Db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's ReportsController. Computed on every request; no totals are stored. */
const dayParam = (request: Request) => new URL(request.url).searchParams.get("today") ?? format(new Date(), "yyyy-MM-dd");
const isDay = (today: string) => /^\d{4}-\d{2}-\d{2}$/.test(today);
const badDay = () => new HttpResponse("today must be YYYY-MM-DD", { status: 400 });

/**
 * The branches' share of the account, for the branch-level reports: their appointments, invoices and payments, with
 * every account-level collection (patients, staff, visits) as is. One branch, or all of them for the Owner's
 * "All branches" total (decision #20): the same report over more rows, never a new report type.
 */
const branchView = (all: Db, branchIds: string[]): Db => ({
  ...all,
  appointments: all.appointments.filter((a) => branchIds.includes(a.branchId)),
  invoices: all.invoices.filter((i) => branchIds.includes(i.branchId)),
  payments: all.payments.filter((p) => branchIds.includes(p.branchId)),
});

export const dashboardHandlers = [
  // ?today=YYYY-MM-DD (the clinic's local day; defaults to now). ?branch= a branch id or `all` (reportBranches).
  http.get(url("/reports/finance"), async ({ request }) => {
    await delay(100);
    const today = dayParam(request);
    if (!isDay(today)) return badDay();
    const branches = reportBranches(request);
    if (branches instanceof Response) return branches;
    return HttpResponse.json(financeSummary(branchView(db, branches), today));
  }),

  // Today at a glance, for every staff role. Same ?today= rule. The birthday job is NOT run here: opening
  // the dashboard must not send texts as a side effect.
  http.get(url("/reports/today"), async ({ request }) => {
    await delay(100);
    const today = dayParam(request);
    if (!isDay(today)) return badDay();
    const branches = reportBranches(request);
    if (branches instanceof Response) return branches;
    // B13c2b E6: no name or birthday for a restricted child (the API's PatientsService.basics).
    return HttpResponse.json(todaySummary({ ...branchView(db, branches), patients: db.patients.filter((p) => !p.restrictedAt) }, today));
  }),
];
