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
  it("serves nothing from the API until a chunk cuts over (B2d fills the list)", () => {
    expect(API_ROUTES).toEqual([]);
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
