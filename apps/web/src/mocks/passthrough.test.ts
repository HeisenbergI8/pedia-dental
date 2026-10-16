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
  it("serves B2's sign-in and clinic reads from the API, and their mocked neighbours from MSW", () => {
    const api = (method: string, path: string) => servedBy(API_ROUTES, method, path);
    for (const path of ["/auth/login", "/auth/logout", "/auth/switch", "/auth/password", "/auth/acknowledgement", "/operator/auth/login"]) {
      expect(api("POST", path), path).toBe(true);
    }
    for (const path of ["/auth/demo-accounts", "/auth/me", "/auth/acknowledgement", "/operator/auth/me", "/clinic", "/branches", "/staff"]) {
      expect(api("GET", path), path).toBe(true);
    }
    expect(API_ROUTES).toHaveLength(14);
    // Same paths, other chunks (B3, B12): still MSW's.
    expect([api("PUT", "/clinic"), api("GET", "/clinic/usage"), api("GET", "/clinic/subscription"), api("POST", "/branches"), api("POST", "/staff")]).toEqual([false, false, false, false, false]);
    expect([api("GET", "/operator/accounts"), api("GET", "/patients")]).toEqual([false, false]);
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
