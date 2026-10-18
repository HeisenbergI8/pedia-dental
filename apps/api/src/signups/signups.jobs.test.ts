import { describe, expect, it } from "vitest";
import { PURGE, SignupsJobs } from "./signups.jobs";
import type { SignupsService } from "./signups.service";

describe("the daily purge of rejected sign-ups' files (B12 decision 15)", () => {
  it("runs purgeRejectedFiles through the job runner's lease, and runs nothing when another instance holds it", async () => {
    let purged = 0;
    const signups = { purgeRejectedFiles: async () => ++purged } as unknown as SignupsService;
    const seen: string[] = [];
    const runner = (held: boolean) => ({ run: async (job: { name: string }, fn: () => Promise<unknown>) => (seen.push(job.name), held ? "skipped" : (await fn(), "ran")) });
    expect(await new SignupsJobs(runner(false) as never, signups).purge()).toBe("ran");
    expect(await new SignupsJobs(runner(true) as never, signups).purge()).toBe("skipped");
    expect([seen, purged]).toEqual([[PURGE.name, PURGE.name], 1]);
    expect(PURGE.leaseMs).toBeLessThan(24 * 3_600_000);
  });
});
