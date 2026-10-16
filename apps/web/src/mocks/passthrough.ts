import { http, passthrough } from "msw";
import { env } from "@/lib/env";
import { matchPath } from "./access";

export type ApiRoute = { method: string; path: string };

/**
 * The routes apps/api serves (CHUNKS.md: cut over chunk by chunk). In `hybrid` mode MSW lets these reach the network,
 * through the dev proxy to the API; every other route stays mocked. Same patterns as RULES in access.ts. Filled by B2d.
 */
export const API_ROUTES: readonly ApiRoute[] = [];

export const servedBy = (routes: readonly ApiRoute[], method: string, path: string) =>
  routes.some((r) => r.method === method && matchPath(r.path, path) !== undefined);

/** Registered before the access gate in hybrid mode only (mocks/browser.ts). Returns nothing for a mocked route. */
export const apiPassthrough = (routes: readonly ApiRoute[] = API_ROUTES) =>
  http.all(`${env.apiUrl}/*`, ({ request }) => {
    const u = new URL(request.url);
    const path = u.pathname.slice(new URL(env.apiUrl, u.origin).pathname.length);
    return servedBy(routes, request.method, path) ? passthrough() : undefined;
  });
