import { http, passthrough } from "msw";
import { env } from "@/lib/env";
import { matchPath } from "./access";

export type ApiRoute = { method: string; path: string };

/**
 * The routes apps/api serves (CHUNKS.md: cut over chunk by chunk). In `hybrid` mode MSW lets these reach the network,
 * through the dev proxy to the API; every other route stays mocked. Same patterns as RULES in access.ts. Exact method
 * and path: `GET /clinic/subscription` (B12) and `/clinic/privacy-notice` (B4) stay mocked beside B3's `/clinic/*`.
 */
export const API_ROUTES: readonly ApiRoute[] = [
  // B2: sign-in and sessions (AuthController). demo-accounts answers only with DEMO_LOGINS=true.
  { method: "GET", path: "/auth/demo-accounts" },
  { method: "POST", path: "/auth/login" },
  { method: "GET", path: "/auth/me" },
  { method: "POST", path: "/auth/logout" },
  { method: "POST", path: "/auth/switch" },
  { method: "POST", path: "/auth/password" },
  { method: "GET", path: "/auth/acknowledgement" },
  { method: "POST", path: "/auth/acknowledgement" },
  // B2: the operator's own sign-in (OperatorAuthController), on pd_operator.
  { method: "POST", path: "/operator/auth/login" },
  { method: "GET", path: "/operator/auth/me" },
  { method: "POST", path: "/operator/auth/logout" },
  // B2: the clinic reads (ClinicController).
  { method: "GET", path: "/clinic" },
  { method: "GET", path: "/branches" },
  { method: "GET", path: "/staff" },
  // B3: the Owner's settings (ClinicController): profile, look, logo, usage, branches and staff logins.
  { method: "PUT", path: "/clinic" },
  { method: "PUT", path: "/clinic/branding" },
  { method: "GET", path: "/clinic/logo" },
  { method: "PUT", path: "/clinic/logo" },
  { method: "DELETE", path: "/clinic/logo" },
  { method: "GET", path: "/clinic/usage" },
  { method: "POST", path: "/branches" },
  { method: "PUT", path: "/branches/:id" },
  { method: "POST", path: "/branches/:id/archive" },
  { method: "POST", path: "/branches/:id/reopen" },
  { method: "POST", path: "/staff" },
  { method: "POST", path: "/staff/:id/deactivate" },
  { method: "POST", path: "/staff/:id/reactivate" },
  // B3: the clinic's reference data (ClinicController, NotesController, MessagesController).
  { method: "GET", path: "/chairs" },
  { method: "GET", path: "/procedures" },
  { method: "GET", path: "/note-templates" },
  { method: "GET", path: "/message-templates" },
  { method: "PUT", path: "/message-templates/:kind" },
];

export const servedBy = (routes: readonly ApiRoute[], method: string, path: string) =>
  routes.some((r) => r.method === method && matchPath(r.path, path) !== undefined);

/** Registered before the access gate in hybrid mode only (mocks/browser.ts). Returns nothing for a mocked route. */
export const apiPassthrough = (routes: readonly ApiRoute[] = API_ROUTES) =>
  http.all(`${env.apiUrl}/*`, ({ request }) => {
    const u = new URL(request.url);
    const path = u.pathname.slice(new URL(env.apiUrl, u.origin).pathname.length);
    return servedBy(routes, request.method, path) ? passthrough() : undefined;
  });
