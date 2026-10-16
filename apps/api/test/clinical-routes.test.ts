import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "post" | "put" | "patch";

/**
 * B5's routes. Each must reach a controller and the real guard: 401 without a session. A route with no controller would
 * be Nest's 404 (before any guard), and one without a rule a 403 naming it.
 */
const B5_ROUTES: [Method, string][] = [
  ["get", "/patients/p1/visits"],
  ["post", "/patients/p1/visits"],
  ["post", "/visits/v1/complete"],
  ["get", "/patients/p1/chart"],
  ["post", "/patients/p1/chart"],
  ["post", "/patients/p1/chart/batch"],
];

/** B6's routes, the same promise. */
const B6_ROUTES: [Method, string][] = [
  ["get", "/patients/p1/growth"],
  ["put", "/visits/v1/growth"],
  ["get", "/patients/p1/plan"],
  ["post", "/patients/p1/plan"],
  ["patch", "/plan-items/i1"],
  ["get", "/patients/p1/notes"],
  ["post", "/patients/p1/notes"],
  ["put", "/notes/n1"],
  ["post", "/notes/n1/sign"],
  ["get", "/appointments"],
  ["get", "/patients/p1/appointments"],
  ["post", "/appointments"],
  ["put", "/appointments/a1"],
  ["post", "/appointments/a1/status"],
  ["get", "/appointment-requests"],
  ["get", "/patients/p1/appointment-requests"],
  ["post", "/patients/p1/appointment-requests"],
  ["post", "/appointment-requests/r1/handled"],
  ["get", "/due-items"],
  ["get", "/reports/today"],
];

describe("B5's and B6's routes are served and guarded (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each([...B5_ROUTES, ...B6_ROUTES])("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });
});
