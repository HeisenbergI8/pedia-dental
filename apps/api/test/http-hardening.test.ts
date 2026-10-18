import { Controller, Get, type INestApplication, Req } from "@nestjs/common";
import type { Request } from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "./support/test-app";

/** Echoes the client address Express derived: what the rate limits key on. */
@Controller("probe-ip")
class IpProbe {
  @Get()
  ip(@Req() req: Request) {
    return { ip: req.ip };
  }
}

let app: INestApplication | undefined;
const open = async (env: NodeJS.ProcessEnv = {}) => (app = await createTestApp({ controllers: [IpProbe], openGuard: true, env }));
afterEach(() => app?.close());

describe("HTTP hardening (B13a Phase 2)", () => {
  it("sends helmet's headers and no x-powered-by", async () => {
    const res = await request((await open()).getHttpServer()).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows only the listed origins, with credentials", async () => {
    const server = (await open()).getHttpServer();
    const preflight = (origin: string) => request(server).options("/api/health").set("Origin", origin).set("Access-Control-Request-Method", "GET");
    const ok = await preflight("http://localhost:3000");
    expect([ok.headers["access-control-allow-origin"], ok.headers["access-control-allow-credentials"]]).toEqual(["http://localhost:3000", "true"]);
    expect((await preflight("https://evil.example")).headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("echoes each configured origin and not localhost", async () => {
    const server = (await open({ CORS_ORIGIN: "https://app.example,https://www.app.example" })).getHttpServer();
    const allowed = async (origin: string) => (await request(server).options("/api/health").set("Origin", origin).set("Access-Control-Request-Method", "GET")).headers["access-control-allow-origin"];
    expect(await allowed("https://app.example")).toBe("https://app.example");
    expect(await allowed("https://www.app.example")).toBe("https://www.app.example");
    expect(await allowed("http://localhost:3000")).toBeUndefined();
  });

  it("reads the client address through exactly TRUST_PROXY_HOPS proxies", async () => {
    const ip = async (hops: string | undefined, forwarded: string) =>
      (await request((await open(hops ? { TRUST_PROXY_HOPS: hops } : {})).getHttpServer()).get("/api/probe-ip").set("X-Forwarded-For", forwarded)).body.ip;
    expect(await ip(undefined, "203.0.113.7")).not.toBe("203.0.113.7");
    await app?.close();
    expect(await ip("1", "203.0.113.7")).toBe("203.0.113.7");
    await app?.close();
    expect(await ip("1", "198.51.100.9, 203.0.113.7")).toBe("203.0.113.7"); // the rightmost hop, not the spoofable left one
  });
});
