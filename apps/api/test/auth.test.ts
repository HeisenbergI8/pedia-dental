import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { RateLimitService } from "../src/auth/rate-limit";
import { SessionService } from "../src/auth/session.service";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";

/** No database: what the auth routes do before they need one. Sign-in itself is proven on MySQL (test/int/auth-*). */
let limited = false;
let app: INestApplication;
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadEnv({ DATABASE_URL: "mysql://unused", LOG_LEVEL: "silent" }))] })
    .overrideProvider(PrismaService).useValue({ $disconnect: async () => {} })
    .overrideProvider(RateLimitService).useValue({ hit: async () => ({ allowed: !limited, retryAfter: 90 }) })
    .overrideProvider(SessionService).useValue({ resolveClinic: async () => undefined, resolveOperator: async () => undefined })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix("api");
  await app.init();
});
afterAll(() => app.close());
beforeEach(() => { limited = false; });

const http = () => request(app.getHttpServer());

describe("/auth without a database", () => {
  it("has no demo-accounts route unless DEMO_LOGINS is on", async () => {
    expect((await http().get("/api/auth/demo-accounts")).status).toBe(404);
  });

  it("answers a malformed sign-in with the schema's issues", async () => {
    const res = await http().post("/api/auth/login").send({ email: "nope", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.map((i: { path: string[] }) => i.path[0]).sort()).toEqual(["email", "password"]);
  });

  it("answers me with 401 signed out, and signs out with the cookie cleared even so", async () => {
    expect((await http().get("/api/auth/me")).status).toBe(401);
    const out = await http().post("/api/auth/logout");
    expect(out.status).toBe(200);
    expect(out.headers["set-cookie"]?.[0]).toMatch(/^pd_session=;.*HttpOnly/);
  });

  it("is rate-limited before anything else, with a plain-text 429 and Retry-After", async () => {
    limited = true;
    const res = await http().post("/api/auth/login").send({});
    expect([res.status, res.headers["retry-after"], res.text]).toEqual([429, "90", "Too many tries from this device. Try again in 2 minutes."]);
  });

  it("checks the session before the body on switch, password and acknowledgement (the mock's order)", async () => {
    for (const path of ["/api/auth/switch", "/api/auth/password", "/api/auth/acknowledgement"]) {
      const res = await http().post(path).send({ not: "valid" });
      expect([res.status, path]).toEqual([401, path]);
    }
    expect((await http().get("/api/auth/acknowledgement")).status).toBe(401);
  });
});

describe("/operator/auth without a database", () => {
  it("answers me with 401 signed out, and clears pd_operator on sign-out", async () => {
    expect((await http().get("/api/operator/auth/me")).status).toBe(401);
    const out = await http().post("/api/operator/auth/logout");
    expect([out.status, out.headers["set-cookie"]?.[0]]).toEqual([200, expect.stringMatching(/^pd_operator=;.*HttpOnly/)]);
  });

  it("is rate-limited like the clinic sign-in", async () => {
    limited = true;
    expect((await http().post("/api/operator/auth/login").send({})).status).toBe(429);
  });
});
