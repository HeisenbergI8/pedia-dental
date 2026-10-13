import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { accountById, platform } from "@/mocks/db";
import { noticeView } from "@/mocks/privacy";

const url = (p: string) => `${env.apiUrl}${p}`;

/**
 * API contract for apps/api's public LegalController (privacy #3): each clinic's privacy notice, readable before
 * sign-in. Reads `platform` only, never a session or the tenant binding (mocks/operator.test.ts checks this file).
 */
export const legalHandlers = [
  http.get(url("/legal/notices/:clinicId"), ({ params }) => {
    const id = String(params.clinicId);
    if (!accountById(id) || !Object.hasOwn(platform.tenants, id)) return new HttpResponse("We can't find that clinic's privacy notice", { status: 404 });
    return HttpResponse.json(noticeView(id));
  }),
];
