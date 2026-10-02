import { http, HttpResponse, delay } from "msw";
import { env } from "@/lib/env";
import { db } from "@/mocks/db";

const url = (p: string) => `${env.apiUrl}${p}`;

/** API contract for the clinic reference data: staff, chairs and the procedure catalog. Read-only for now. */
export const clinicHandlers = [
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
