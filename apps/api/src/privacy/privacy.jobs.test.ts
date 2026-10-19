import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { JobRunner } from "../jobs/job-runner";
import type { ErasureService } from "./erasure.service";
import { PRIVACY_ANONYMISE, PrivacyJobs } from "./privacy.jobs";

const CONFIRMED = { yearsAfterLastVisit: 10, untilAge: 18 };
const UNCONFIRMED = { yearsAfterLastVisit: null, untilAge: null };

function jobsWith(on: boolean, periods: typeof CONFIRMED | typeof UNCONFIRMED) {
  const run = vi.fn(async (_job: unknown, fn: () => Promise<unknown>) => { await fn(); return "ran" as const; });
  const anonymiseDue = vi.fn(async () => 0);
  const jobs = new PrivacyJobs({ run } as unknown as JobRunner, { anonymiseDue } as unknown as ErasureService, { RETENTION_ERASURE: on } as Env, periods);
  return { jobs, run, anonymiseDue };
}

describe("privacy.anonymise (B13c2b-2)", () => {
  it("never starts while RETENTION_ERASURE is off", async () => {
    const { jobs, run } = jobsWith(false, CONFIRMED);
    await jobs.anonymise();
    expect(run).not.toHaveBeenCalled();
  });
  it("never starts while the periods are unconfirmed, even switched on", async () => {
    const { jobs, run } = jobsWith(true, UNCONFIRMED);
    await jobs.anonymise();
    expect(run).not.toHaveBeenCalled();
  });
  it("runs under its lease with the confirmed periods when both hold", async () => {
    const { jobs, run, anonymiseDue } = jobsWith(true, CONFIRMED);
    await jobs.anonymise();
    expect(run).toHaveBeenCalledWith(PRIVACY_ANONYMISE, expect.any(Function));
    expect(anonymiseDue).toHaveBeenCalledWith(CONFIRMED);
  });
});
