import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, middleware } from "./middleware";

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

  it("proxies nothing without API_PROXY_TARGET (the MSW-only demo)", () => {
    vi.stubEnv("API_PROXY_TARGET", "");
    const res = call("http://localhost:3000/api/patients");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
