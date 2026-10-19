import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "put" | "post";

/** B4d's notice routes, B13c2a's copy and audit log, B13c2b's register: the clinic's behind the guard, the public one reaching its controller without a session. */
const PRIVACY_ROUTES: [Method, string][] = [
  ["get", "/clinic/privacy-notice"], ["put", "/clinic/privacy-notice"],
  ["post", "/patients/patient_sibling/exports"], // B13c2a: the copy of records
  ["get", "/audit-log"], // B13c2a: the audit-log reader
  ["get", "/privacy-requests"], ["post", "/privacy-requests"], ["post", "/privacy-requests/r1/close"], // B13c2b
];

describe("B4d's, B13c2a's and B13c2b's privacy routes are served (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each(PRIVACY_ROUTES)("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });

  it("serves /legal/notices/:clinicId without a session (a public route with a controller)", async () => {
    const res = await request(app.getHttpServer()).get("/api/legal/notices/clinic_demo");
    // The fake database can't answer it, but the guard let it through and a controller took it.
    expect([401, 403, 404]).not.toContain(res.status);
  });
});
