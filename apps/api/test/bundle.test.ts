import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBundle, removeBundle, startBundle } from "./support/bundle";

/** B13a Step 6.2: the shipped artifact boots without the SWC loader, with DI, the guard, validation and headers wired. */
describe("the production bundle (no database)", { timeout: 90_000 }, () => {
  let dir: string;
  let api: Awaited<ReturnType<typeof startBundle>>;
  beforeAll(async () => {
    dir = buildBundle();
    api = await startBundle(dir, { DATABASE_URL: "mysql://u:p@127.0.0.1:1/none" }); // connected lazily: nothing reaches it
  }, 90_000);
  afterAll(() => {
    api?.stop();
    removeBundle(dir);
  });

  it("serves the liveness probe with helmet's headers", async () => {
    const res = await fetch(`${api.url}/api/health/live`);
    expect([res.status, await res.json(), res.headers.get("x-content-type-options")]).toEqual([200, { status: "ok" }, "nosniff"]);
  });

  it("resolves the access guard by its constructor types (decorator metadata survived)", async () => {
    const res = await fetch(`${api.url}/api/clinic`);
    expect([res.status, await res.text()]).toEqual([401, "Sign in to continue"]);
  });

  it("inlines the workspace packages, carries no SWC loader, and sets the clinic time zone first", () => {
    const code = readFileSync(join(dir, "main.mjs"), "utf8");
    expect(code).not.toContain("@swc-node/register");
    expect(code).not.toMatch(/from ["']@pedia\//);
    const tz = code.indexOf("process.env.TZ =");
    expect(tz).toBeGreaterThan(-1);
    expect(tz).toBeLessThan(code.indexOf("NestFactory.create"));
  });
});
