import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    expect(loadEnv({ DATABASE_URL: "mysql://u:p@h/db" })).toEqual({
      DATABASE_URL: "mysql://u:p@h/db",
      PORT: 4100,
      CORS_ORIGIN: "http://localhost:3000",
      LOG_LEVEL: "info",
    });
  });

  it("names every bad variable", () => {
    expect(() => loadEnv({ DATABASE_URL: "postgres://x", PORT: "abc" })).toThrow(/DATABASE_URL[\s\S]*PORT/);
  });
});
