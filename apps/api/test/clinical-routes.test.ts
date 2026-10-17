import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { LINK_GONE } from "../src/storage/local-files.controller";
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
];

/** B7's routes, the same promise. */
const B7_ROUTES: [Method, string][] = [
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

/** B8's routes, the same promise. */
const B8_ROUTES: [Method, string][] = [
  ["get", "/patients/p1/invoices"],
  ["post", "/patients/p1/invoices"],
  ["post", "/invoices/i1/void"],
  ["get", "/patients/p1/payments"],
  ["get", "/payments"],
  ["get", "/reports/finance"],
  ["post", "/invoices/i1/payments"],
  ["post", "/patients/p1/deposits"],
  ["post", "/invoices/i1/apply-credit"],
];

/** B9's routes, the same promise. */
const B9_ROUTES: [Method, string][] = [
  ["get", "/messages"],
  ["post", "/due-items/d1/message"],
  ["post", "/patients/p1/birthday-greeting"],
];

describe("B5–B9's routes are served and guarded (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it("serves GET /files/:token without a session, and an unknown token is the link's own 404 (B10)", async () => {
    const res = await request(app.getHttpServer()).get("/api/files/junk");
    expect([res.status, res.text]).toEqual([404, LINK_GONE]);
  });

  it.each([...B5_ROUTES, ...B6_ROUTES, ...B7_ROUTES, ...B8_ROUTES, ...B9_ROUTES])("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });
});
