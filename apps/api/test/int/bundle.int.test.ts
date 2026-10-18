import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBundle, removeBundle, startBundle } from "../support/bundle";

/** B13a Step 6.2: the bundle on MySQL. A model query runs Prisma 7's query compiler, which raw SQL doesn't. */
describe("the production bundle on MySQL", { timeout: 90_000 }, () => {
  let dir: string;
  let api: Awaited<ReturnType<typeof startBundle>>;
  beforeAll(async () => {
    dir = buildBundle();
    api = await startBundle(dir, { DATABASE_URL: process.env.DATABASE_URL! });
  }, 90_000);
  afterAll(() => {
    api?.stop();
    removeBundle(dir);
  });

  it("is ready: the database answers through the adapter", async () => {
    expect((await fetch(`${api.url}/api/health/ready`)).status).toBe(200);
  });

  it("looks a session up with a model query: 401, not 500", async () => {
    const res = await fetch(`${api.url}/api/clinic`, { headers: { cookie: "pd_session=not-a-token" } });
    expect([res.status, await res.text()]).toEqual([401, "Sign in to continue"]);
  });

  it("validates a body with the Zod pipe and answers the issues as JSON (the sign-in's rate limit reads the database first)", async () => {
    const res = await fetch(`${api.url}/api/operator/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(400);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
