import { http, HttpResponse, delay } from "msw";
import { financeSummary, todaySummary } from "@pedia/shared";
import { env } from "@/lib/env";
import { reportBranches } from "@/mocks/access";
import { today as clockToday } from "@/mocks/clock";
import { db, type Db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for apps/api's ReportsController. Computed on every request; no totals are stored. */
const dayParam = (request: Request) => new URL(request.url).searchParams.get("today") ?? clockToday();
/** apps/api reports.service dayRefusal: a real day, from 2000 to the end of the sixth year ahead, past the 5-year booking horizon (bot report #24). */
function dayRefusal(day: string) {
  const real = /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().startsWith(day); // 2026-02-30 rolls over
  if (!real) return new HttpResponse("today must be YYYY-MM-DD", { status: 400 });
  const [first, last] = ["2000-01-01", `${Number(clockToday().slice(0, 4)) + 6}-12-31`];
  return day < first || day > last ? new HttpResponse(`today must be a day from ${first} to ${last}`, { status: 400 }) : undefined;
}

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
    const refused = dayRefusal(today);
    if (refused) return refused;
    const branches = reportBranches(request);
    if (branches instanceof Response) return branches;
    return HttpResponse.json(financeSummary(branchView(db, branches), today));
  }),

  // Today at a glance, for every staff role. Same ?today= rule. The birthday job is NOT run here: opening
  // the dashboard must not send texts as a side effect.
  http.get(url("/reports/today"), async ({ request }) => {
    await delay(100);
    const today = dayParam(request);
    const refused = dayRefusal(today);
    if (refused) return refused;
    const branches = reportBranches(request);
    if (branches instanceof Response) return branches;
    // B13c2b E6: no name or birthday for a restricted child (the API's PatientsService.basics).
    return HttpResponse.json(todaySummary({ ...branchView(db, branches), patients: db.patients.filter((p) => !p.restrictedAt) }, today));
  }),
];
