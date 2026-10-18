import { describe, expect, it } from "vitest";
import { SubscriptionRecordsService } from "./subscription-records.service";
import { SETTLE, SubscriptionsJobs } from "./subscriptions.jobs";

describe("the nightly settle (B12 Step 7.1)", () => {
  it("runs settleAll through the job runner's lease, and runs nothing when another instance holds it", async () => {
    let settled = 0;
    const records = { settleAll: async () => ++settled } as unknown as SubscriptionRecordsService;
    const seen: string[] = [];
    const runner = (held: boolean) => ({ run: async (job: { name: string }, fn: () => Promise<unknown>) => (seen.push(job.name), held ? "skipped" : (await fn(), "ran")) });
    expect(await new SubscriptionsJobs(runner(false) as never, records).settle()).toBe("ran");
    expect(await new SubscriptionsJobs(runner(true) as never, records).settle()).toBe("skipped");
    expect([seen, settled]).toEqual([[SETTLE.name, SETTLE.name], 1]);
    expect(SETTLE.leaseMs).toBeLessThan(24 * 3_600_000);
  });

  it("settles every clinic, going on past one that fails", async () => {
    const tried: string[] = [];
    const service = Object.create(SubscriptionRecordsService.prototype) as SubscriptionRecordsService;
    Object.assign(service, {
      log: { error: () => undefined, log: () => undefined },
      prisma: { subscription: { findMany: async () => [{ clinicId: "a" }, { clinicId: "b" }, { clinicId: "c" }] } },
      settle: async (id: string) => {
        tried.push(id);
        if (id === "b") throw new Error("deadlock");
      },
    });
    expect(await service.settleAll()).toBe(2);
    expect(tried).toEqual(["a", "b", "c"]);
  });
});
