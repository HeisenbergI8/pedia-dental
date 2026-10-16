import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "put";

/** B4d's notice routes: the clinic's behind the guard, the public one reaching its controller without a session. */
const B4D_ROUTES: [Method, string][] = [["get", "/clinic/privacy-notice"], ["put", "/clinic/privacy-notice"]];

describe("B4d's notice routes are served (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each(B4D_ROUTES)("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });

  it("serves /legal/notices/:clinicId without a session (a public route with a controller)", async () => {
    const res = await request(app.getHttpServer()).get("/api/legal/notices/clinic_demo");
    // The fake database can't answer it, but the guard let it through and a controller took it.
    expect([401, 403, 404]).not.toContain(res.status);
  });
});
