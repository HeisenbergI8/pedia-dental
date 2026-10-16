import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

type Method = "get" | "put" | "post" | "delete";

/**
 * B3's routes, added phase by phase. Each must reach a controller and the real guard: 401 without a session. A route
 * with no controller would be Nest's 404 (before any guard), and one without a rule a 403 naming it.
 */
const B3_ROUTES: [Method, string][] = [
  ["get", "/chairs"],
  ["get", "/procedures"],
  ["get", "/note-templates"],
  ["get", "/message-templates"],
  ["put", "/message-templates/recall"],
  ["put", "/clinic"],
  ["put", "/clinic/branding"],
  ["get", "/clinic/logo"],
  ["put", "/clinic/logo"],
  ["delete", "/clinic/logo"],
  ["get", "/clinic/usage"],
  ["post", "/branches"],
  ["put", "/branches/b1"],
  ["post", "/branches/b1/archive"],
  ["post", "/branches/b1/reopen"],
  ["post", "/staff"],
  ["post", "/staff/s1/deactivate"],
  ["post", "/staff/s1/reactivate"],
];

describe("B3's routes are served and guarded (no database)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it.each(B3_ROUTES)("%s %s answers 401 without a session", async (method, path) => {
    expect((await request(app.getHttpServer())[method](`/api${path}`)).status).toBe(401);
  });
});
