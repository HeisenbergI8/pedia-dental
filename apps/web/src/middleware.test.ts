import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { config, MAX_PROXY_BODY_BYTES, middleware } from "./middleware";

const ORIGIN_VALUE = "x".repeat(40); // a stand-in, not a real value
const call = (url: string, headers: Record<string, string> = {}) => middleware(new NextRequest(url, { headers }));
afterEach(() => vi.unstubAllEnvs());

describe("the /api proxy (#2: the origin lock)", () => {
  it("runs on /api only", () => {
    expect(config.matcher).toBe("/api/:path*");
  });

  it("forwards to API_PROXY_TARGET with the path and query, adding the origin secret", () => {
    vi.stubEnv("API_PROXY_TARGET", "https://api.example.com/");
    vi.stubEnv("ORIGIN_SECRET", ORIGIN_VALUE);
    const res = call("https://app.example.com/api/patients?q=ana", { "accept-language": "en" });
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://api.example.com/api/patients?q=ana");
    expect(res.headers.get("x-middleware-request-x-primolar-origin")).toBe(ORIGIN_VALUE);
    expect(res.headers.get("x-middleware-request-accept-language")).toBe("en"); // the caller's own headers still go along
  });

  it("never passes on a caller's own origin header", () => {
    vi.stubEnv("API_PROXY_TARGET", "http://localhost:4100");
    vi.stubEnv("ORIGIN_SECRET", "");
    const res = call("http://localhost:3000/api/auth/me", { "x-primolar-origin": "guess" });
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:4100/api/auth/me");
    expect(res.headers.get("x-middleware-request-x-primolar-origin")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")).not.toContain("x-primolar-origin");
  });

  it("answers 413 itself above the body limit next.config sets, and passes anything up to it to the API (issue 16)", async () => {
    vi.stubEnv("API_PROXY_TARGET", "http://localhost:4100");
    expect(nextConfig.experimental?.middlewareClientMaxBodySize).toBe(MAX_PROXY_BODY_BYTES);
    const over = call("http://localhost:3000/api/patients/p1/photos", { "content-length": String(MAX_PROXY_BODY_BYTES + 1) });
    expect([over.status, await over.text()]).toEqual([413, "Files must be under 10 MB"]);
    expect(over.headers.get("x-middleware-rewrite")).toBeNull();
    const tenMbPlusOne = call("http://localhost:3000/api/patients/p1/photos", { "content-length": String(10 * 1024 * 1024 + 1) });
    expect(tenMbPlusOne.headers.get("x-middleware-rewrite")).toBe("http://localhost:4100/api/patients/p1/photos"); // the API's own 413
  });

  it("never passes on a caller's own X-Forwarded-For (issue 17)", () => {
    vi.stubEnv("API_PROXY_TARGET", "http://localhost:4100");
    vi.stubEnv("VERCEL", "");
    const local = call("http://localhost:3000/api/auth/login", { "x-forwarded-for": "10.77.7.82", "x-real-ip": "10.77.7.83" });
    expect(local.headers.get("x-middleware-request-x-forwarded-for")).toBeNull();
    expect(local.headers.get("x-middleware-override-headers")).not.toContain("x-forwarded-for");
  });

  it("on Vercel, sends the client address Vercel gives in x-real-ip as X-Forwarded-For", () => {
    vi.stubEnv("API_PROXY_TARGET", "https://api.example.com");
    vi.stubEnv("VERCEL", "1");
    const res = call("https://app.example.com/api/auth/login", { "x-forwarded-for": "10.77.7.82, 198.51.100.4", "x-real-ip": "203.0.113.9" });
    expect(res.headers.get("x-middleware-request-x-forwarded-for")).toBe("203.0.113.9");
  });

  it("proxies nothing without API_PROXY_TARGET (the MSW-only demo)", () => {
    vi.stubEnv("API_PROXY_TARGET", "");
    const res = call("http://localhost:3000/api/patients");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
