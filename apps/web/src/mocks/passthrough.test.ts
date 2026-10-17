import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { API_ROUTES, apiPassthrough, servedBy } from "./passthrough";

const routes = [{ method: "GET", path: "/branches" }, { method: "POST", path: "/staff/:id/deactivate" }];

describe("which routes the API serves", () => {
  it("matches method and pattern, segment for segment", () => {
    expect(servedBy(routes, "GET", "/branches")).toBe(true);
    expect(servedBy(routes, "POST", "/staff/s1/deactivate")).toBe(true);
    expect(servedBy(routes, "POST", "/branches")).toBe(false);
    expect(servedBy(routes, "GET", "/branches/b1")).toBe(false);
  });
  it("serves B2's sign-in, B3's clinic setup, B4's patients, B5's chart, B6's clinical record, B7's schedule, B8's billing, B9's messages and B10's photos and documents from the API, and their mocked neighbours from MSW", () => {
    const api = (method: string, path: string) => servedBy(API_ROUTES, method, path);
    for (const path of ["/auth/login", "/auth/logout", "/auth/switch", "/auth/password", "/auth/acknowledgement", "/operator/auth/login"]) {
      expect(api("POST", path), path).toBe(true);
    }
    for (const path of ["/auth/demo-accounts", "/auth/me", "/auth/acknowledgement", "/operator/auth/me", "/clinic", "/branches", "/staff"]) {
      expect(api("GET", path), path).toBe(true);
    }
    // B3: every Owner settings write, the usage, the logo and the reference data.
    const b3 = [
      ["PUT", "/clinic"], ["PUT", "/clinic/branding"], ["GET", "/clinic/logo"], ["PUT", "/clinic/logo"], ["DELETE", "/clinic/logo"],
      ["GET", "/clinic/usage"], ["POST", "/branches"], ["PUT", "/branches/b1"], ["POST", "/branches/b1/archive"], ["POST", "/branches/b1/reopen"],
      ["POST", "/staff"], ["POST", "/staff/s1/deactivate"], ["POST", "/staff/s1/reactivate"],
      ["GET", "/chairs"], ["GET", "/procedures"], ["GET", "/note-templates"], ["GET", "/message-templates"], ["PUT", "/message-templates/recall"],
    ] as const;
    for (const [method, path] of b3) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B4: patients, consents, the photo and the privacy notice, public and the Owner's.
    const b4 = [
      ["GET", "/patients"], ["GET", "/patient-summaries"], ["GET", "/patient-duplicates"], ["POST", "/patients"],
      ["GET", "/patients/p1"], ["PUT", "/patients/p1"], ["PATCH", "/patients/p1"], ["GET", "/patients/p1/summary"],
      ["POST", "/patients/p1/consents"], ["POST", "/patients/p1/privacy-consent"], ["POST", "/patients/p1/privacy-choices"],
      ["PUT", "/patients/p1/photo"], ["GET", "/patients/p1/photo"], ["DELETE", "/patients/p1/photo"],
      ["GET", "/clinic/privacy-notice"], ["PUT", "/clinic/privacy-notice"], ["GET", "/legal/notices/clinic_demo"],
    ] as const;
    for (const [method, path] of b4) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B5: visits and the chart. Their neighbours (growth on a visit, notes, the plan) stay on MSW until B6.
    const b5 = [
      ["GET", "/patients/p1/visits"], ["POST", "/patients/p1/visits"], ["POST", "/visits/v1/complete"],
      ["GET", "/patients/p1/chart"], ["POST", "/patients/p1/chart"], ["POST", "/patients/p1/chart/batch"],
    ] as const;
    for (const [method, path] of b5) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B6: notes, growth and the treatment plan.
    const b6 = [
      ["GET", "/patients/p1/notes"], ["POST", "/patients/p1/notes"], ["PUT", "/notes/n1"], ["POST", "/notes/n1/sign"],
      ["GET", "/patients/p1/growth"], ["PUT", "/visits/v1/growth"],
      ["GET", "/patients/p1/plan"], ["POST", "/patients/p1/plan"], ["PATCH", "/plan-items/i1"],
    ] as const;
    for (const [method, path] of b6) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B7: appointments, requests, the due list and Today.
    const b7 = [
      ["GET", "/appointments"], ["GET", "/patients/p1/appointments"], ["POST", "/appointments"], ["PUT", "/appointments/a1"],
      ["POST", "/appointments/a1/status"], ["GET", "/appointment-requests"], ["GET", "/patients/p1/appointment-requests"],
      ["POST", "/patients/p1/appointment-requests"], ["POST", "/appointment-requests/r1/handled"], ["GET", "/due-items"], ["GET", "/reports/today"],
    ] as const;
    for (const [method, path] of b7) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B8: bills, payments, deposits, credit, voids, the day's collections and the dashboard.
    const b8 = [
      ["GET", "/patients/p1/invoices"], ["POST", "/patients/p1/invoices"], ["POST", "/invoices/i1/void"], ["GET", "/patients/p1/payments"],
      ["GET", "/payments"], ["POST", "/invoices/i1/payments"], ["POST", "/patients/p1/deposits"], ["POST", "/invoices/i1/apply-credit"],
      ["GET", "/reports/finance"],
    ] as const;
    for (const [method, path] of b8) expect(api(method, path), `${method} ${path}`).toBe(true);
    // B9: the message log, the recall text and the birthday greeting.
    const b9 = [["GET", "/messages"], ["POST", "/due-items/d1/message"], ["POST", "/patients/p1/birthday-greeting"]] as const;
    for (const [method, path] of b9) expect(api(method, path), `${method} ${path}`).toBe(true);
    expect([api("PUT", "/messages"), api("GET", "/due-items/d1/message")]).toEqual([false, false]); // exact method
    // B10: photos, the documents log and the local driver's file links.
    const b10 = [
      ["GET", "/patients/p1/photos"], ["POST", "/patients/p1/photos"], ["GET", "/photos/ph1/file"], ["GET", "/documents"],
      ["GET", "/patients/p1/documents"], ["POST", "/patients/p1/documents"], ["GET", "/files/abc.def"],
    ] as const;
    for (const [method, path] of b10) expect(api(method, path), `${method} ${path}`).toBe(true);
    expect([api("POST", "/files/x"), api("DELETE", "/photos/ph1")]).toEqual([false, false]); // exact method
    expect(API_ROUTES).toHaveLength(14 + b3.length + b4.length + b5.length + b6.length + b7.length + b8.length + b9.length + b10.length);
    // Same prefixes, other chunks (B12, B13): still MSW's. DELETE /notes/:id isn't a route (exact method).
    expect([api("GET", "/clinic/subscription"), api("POST", "/patients/p1/exports"), api("DELETE", "/notes/n1")]).toEqual([false, false, false]);
    expect(api("POST", "/operator/accounts/a1/subscription/payments")).toBe(false);
    expect(api("DELETE", "/appointments/a1")).toBe(false);
    expect([api("GET", "/operator/accounts"), api("DELETE", "/branches/b1")]).toEqual([false, false]);
  });
});

describe("the passthrough handler", () => {
  // Nothing listens at the test API URL: a passed-through request fails, a mocked one gets the mock's answer.
  const server = setupServer(apiPassthrough(routes), http.all(`${env.apiUrl}/*`, () => HttpResponse.json("mock")));
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterAll(() => server.close());

  it("lets a listed route reach the network and keeps every other one mocked", async () => {
    await expect(fetch(`${env.apiUrl}/branches`)).rejects.toThrow();
    expect(await (await fetch(`${env.apiUrl}/clinic`)).json()).toBe("mock");
  });
});
