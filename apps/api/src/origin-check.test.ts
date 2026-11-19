import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { originCheck } from "./origin-check";

const SECRET = "s3cret-".repeat(6);
const run = (path: string, headers: Record<string, string | string[]> = {}) => {
  const res = { status: vi.fn(), type: vi.fn(), send: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const next = vi.fn() as unknown as NextFunction;
  originCheck(SECRET)({ path, headers } as unknown as Request, res as unknown as Response, next);
  return { passed: vi.mocked(next).mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] };
};

describe("originCheck (#2)", () => {
  it("passes the exact secret, from the header the web's proxy sets", () => {
    expect(run("/api/patients", { "x-primolar-origin": SECRET })).toEqual({ passed: true, status: undefined });
  });

  it("refuses a missing, wrong, longer, shorter or repeated header with 403", () => {
    for (const headers of [{} as Record<string, string>, { "x-primolar-origin": "nope" }, { "x-primolar-origin": `${SECRET}!` }, { "x-primolar-origin": SECRET.slice(1) }, { "x-primolar-origin": [SECRET, SECRET] }]) {
      expect(run("/api/patients", headers)).toEqual({ passed: false, status: 403 });
    }
  });

  it("leaves only the health probes open", () => {
    for (const path of ["/api/health", "/api/health/live", "/api/health/ready"]) expect(run(path).passed, path).toBe(true);
    for (const path of ["/api/health/ready/x", "/api/healthz", "/api/auth/login"]) expect(run(path).passed, path).toBe(false);
  });
});
