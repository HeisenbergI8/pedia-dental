import { describe, expect, it } from "vitest";
import { SeedRefused, assertSeedAllowed } from "./seed-database";

describe("assertSeedAllowed", () => {
  it("refuses without DEMO_LOGINS, whatever the database holds", () => {
    expect(() => assertSeedAllowed({ DEMO_LOGINS: false }, 0)).toThrow(SeedRefused);
  });
  it("refuses on top of existing clinic accounts", () => {
    expect(() => assertSeedAllowed({ DEMO_LOGINS: true }, 3)).toThrow(/3 clinic account\(s\) already exist/);
  });
  it("allows an empty demo database", () => {
    expect(() => assertSeedAllowed({ DEMO_LOGINS: true }, 0)).not.toThrow();
  });
});
