import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

const SECRET = "a".repeat(40) + "Z9";
let app: INestApplication | undefined;
const open = async (env: NodeJS.ProcessEnv = {}) => (app = await createTestApp({ openGuard: true, env }));
afterEach(() => app?.close());

describe("the origin lock (#2)", () => {
  it("refuses, with 403, a request without the web proxy's header or with a wrong one", async () => {
    const server = (await open({ ORIGIN_SECRET: SECRET })).getHttpServer();
    const none = await request(server).post("/api/auth/login").send({ phone: "09170000000", password: "x" });
    expect([none.status, none.text]).toEqual([403, "Forbidden."]);
    expect((await request(server).get("/api/auth/me").set("X-Primolar-Origin", SECRET.slice(0, -1))).status).toBe(403);
    expect((await request(server).get("/api/auth/me").set("X-Primolar-Origin", `${SECRET}x`)).status).toBe(403);
    expect((await request(server).get("/api/nothing-here")).status).toBe(403); // before routing: no 404 to probe with
  });

  it("lets the proxy's requests through to their routes", async () => {
    const server = (await open({ ORIGIN_SECRET: SECRET })).getHttpServer();
    const res = await request(server).get("/api/nothing-here").set("X-Primolar-Origin", SECRET);
    expect(res.status).toBe(404);
  });

  it("keeps the load balancer's and the container's health probes open", async () => {
    const server = (await open({ ORIGIN_SECRET: SECRET })).getHttpServer();
    for (const path of ["/api/health/live", "/api/health/ready", "/api/health"]) expect((await request(server).get(path)).status, path).toBe(200);
  });

  it("is off where ORIGIN_SECRET is unset (APP_ENV=local, which env.ts allows only there)", async () => {
    const server = (await open()).getHttpServer();
    expect((await request(server).get("/api/nothing-here")).status).toBe(404);
  });
});
