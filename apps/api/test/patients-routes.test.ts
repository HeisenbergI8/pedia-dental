import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "put" | "patch" | "post" | "delete";

/**
 * B4's routes, added phase by phase. Each must reach a controller and the real guard: 401 without a session. A route
 * with no controller would be Nest's 404 (before any guard), and one without a rule a 403 naming it.
 */
const B4_ROUTES: [Method, string][] = [
  ["get", "/patients"],
  ["get", "/patient-summaries"],
  ["get", "/patient-duplicates"],
  ["get", "/patients/p1"],
  ["get", "/patients/p1/summary"],
  ["post", "/patients"],
  ["put", "/patients/p1"],
  ["patch", "/patients/p1"],
  ["post", "/patients/p1/consents"],
  ["post", "/patients/p1/privacy-consent"],
  ["post", "/patients/p1/privacy-choices"],
];

describe("B4's routes are served and guarded (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each(B4_ROUTES)("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });
});
