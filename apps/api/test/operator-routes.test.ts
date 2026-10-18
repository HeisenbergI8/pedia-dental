import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "put" | "post" | "delete";

/**
 * B12's operator routes, added phase by phase. Each must reach a controller and the real guard: 401 without
 * `pd_operator` (a route with no controller would be Nest's 404, before any guard; one without a rule a 403).
 */
const OPERATOR_ROUTES: [Method, string][] = [
  ["get", "/operator/prices"],
  ["put", "/operator/prices"],
  ["get", "/operator/payment-qr"],
  ["put", "/operator/payment-qr"],
  ["get", "/operator/signups"],
  ["get", "/operator/signups/s1/files/k1"],
  ["put", "/operator/signups/s1"],
  ["post", "/operator/signups/s1/payment"],
  ["post", "/operator/signups/s1/reject"],
  ["post", "/operator/signups/s1/approve"],
  ["get", "/operator/accounts"],
  ["post", "/operator/accounts"],
  ["put", "/operator/accounts/a1/tier"],
  ["get", "/operator/accounts/a1/subscription"],
  ["post", "/operator/accounts/a1/subscription/payments"],
  ["post", "/operator/accounts/a1/subscription/cancel"],
  ["post", "/operator/accounts/a1/suspend"],
  ["post", "/operator/accounts/a1/reactivate"],
  ["get", "/operator/accounts/a1/staff"],
  ["post", "/operator/accounts/a1/owner"],
  ["put", "/operator/accounts/a1/branding"],
  ["get", "/operator/receipts"],
  ["get", "/operator/receipts/r1/image"],
  ["post", "/operator/receipts/r1/confirm"],
  ["post", "/operator/receipts/r1/reject"],
];

/** B12's clinic routes for the Owner's bill: 401 without a clinic session. */
const CLINIC_ROUTES: [Method, string][] = [
  ["get", "/clinic/subscription"],
  ["post", "/clinic/subscription/receipts"],
  ["get", "/clinic/subscription/receipts/r1/image"],
];

/** B12's public routes: no session of any kind, so neither 401 nor 403; and served (not Nest's 404). */
const PUBLIC_ROUTES: [Method, string][] = [
  ["get", "/signups/prices"],
  ["get", "/signups/payment-qr/image"],
  ["post", "/signups"],
  ["get", "/signups/PRM-AAAA-BBBB"],
  ["post", "/signups/PRM-AAAA-BBBB/receipts"],
];

describe("B12's routes are served and guarded (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each(OPERATOR_ROUTES)("%s %s answers 401 without an operator session", async (method, path) => {
    const res = await request(app.getHttpServer())[method](`/api${path}`);
    expect([res.status, res.text]).toEqual([401, "Sign in to the Primolar console to continue"]);
  });

  it.each(OPERATOR_ROUTES)("%s %s answers 401 to a clinic session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`).set("Cookie", "pd_session=clinic")).status).toBe(401);
  });

  it.each(CLINIC_ROUTES)("%s %s answers 401 without a clinic session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });

  it.each(PUBLIC_ROUTES)("%s %s reaches its controller with no cookie at all", async (method, path) => {
    const res = await request(app.getHttpServer())[method](`/api${path}`);
    expect([401, 403, 404]).not.toContain(res.status); // the fake database answers 500: the controller ran
  });
});
