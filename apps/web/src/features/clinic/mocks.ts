import { http, HttpResponse, delay } from "msw";
import type { ClinicContext } from "@pedia/shared";
import { env } from "@/lib/env";
import { branchOf, sessionOf, usableBranchesOf } from "@/mocks/access";
import { currentAccount, db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for the clinic account and its reference data: branches, staff, chairs and the procedure catalog. */
export const clinicHandlers = [
  // Everyone signed in, parents included (clinic.view): the name and hours every screen shows.
  http.get(url("/clinic"), async ({ request }) => {
    await delay(100);
    const session = sessionOf(request)!; // behind the access gate
    const context: ClinicContext = { account: currentAccount(), branches: usableBranchesOf(session), activeBranchId: branchOf(session).id };
    return HttpResponse.json(context);
  }),

  http.get(url("/staff"), async () => {
    await delay(100);
    return HttpResponse.json(db.staff);
  }),

  http.get(url("/chairs"), async () => {
    await delay(100);
    return HttpResponse.json(db.chairs);
  }),

  http.get(url("/procedures"), async () => {
    await delay(100);
    return HttpResponse.json(db.procedures);
  }),
];
