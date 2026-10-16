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
