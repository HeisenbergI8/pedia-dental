import { Controller, Get, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestContext } from "../src/common/request-context";
import { createTestApp } from "./support/test-app";

@Controller("probe")
class ProbeController {
  @Get()
  probe() {
    return requestContext.current() ?? null;
  }
}

describe("request context over HTTP", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });
  afterAll(() => app.close());

  it("gives each request an id, echoed in the header and readable by the handler", async () => {
    const res = await request(app.getHttpServer()).get("/api/probe");
    expect(res.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
    expect(res.body).toEqual({ requestId: res.headers["x-request-id"], operator: false });
  });

  it("keeps a well-formed incoming id and replaces a malformed one", async () => {
    const kept = await request(app.getHttpServer()).get("/api/probe").set("x-request-id", "edge-12345678");
    expect(kept.body.requestId).toBe("edge-12345678");
    const replaced = await request(app.getHttpServer()).get("/api/probe").set("x-request-id", "bad id {}");
    expect(replaced.body.requestId).not.toBe("bad id {}");
  });

  it("gives two requests two ids", async () => {
    const [a, b] = await Promise.all([1, 2].map(() => request(app.getHttpServer()).get("/api/probe")));
    expect(a!.body.requestId).not.toBe(b!.body.requestId);
  });

  it("runs on unknown routes too, so their 404 is logged with an id", async () => {
    const res = await request(app.getHttpServer()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});
