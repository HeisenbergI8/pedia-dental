import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Hasher } from "../auth/hashing";
import type { PrismaService } from "../prisma/prisma.service";
import { resetDemo } from "./demo-reset";
import { SeedRefused, seedDatabase } from "./seed-database";

vi.mock("./seed-database", async (actual) => ({ ...(await actual<typeof import("./seed-database")>()), seedDatabase: vi.fn(async () => {}) }));

const prisma = {
  $queryRaw: vi.fn(async () => [{ name: "Patient" }, { name: "JobLock" }, { name: "_prisma_migrations" }, { name: "Session" }]),
  $executeRawUnsafe: vi.fn(async (_sql: string) => 0),
};
const run = (env: { APP_ENV: "local" | "demo" | "production"; DEMO_LOGINS: boolean }) =>
  resetDemo(prisma as unknown as PrismaService, {} as Hasher, env);

describe("resetDemo (B13c1 E5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses production and a deployment without demo logins, before touching a table", async () => {
    await expect(run({ APP_ENV: "production", DEMO_LOGINS: true })).rejects.toThrow(SeedRefused);
    await expect(run({ APP_ENV: "demo", DEMO_LOGINS: false })).rejects.toThrow(SeedRefused);
    expect([prisma.$queryRaw, prisma.$executeRawUnsafe, seedDatabase].map((f) => vi.mocked(f).mock.calls.length)).toEqual([0, 0, 0]);
  });

  it("empties every table but the migration log and the job lease, then seeds", async () => {
    await run({ APP_ENV: "demo", DEMO_LOGINS: true });
    expect(prisma.$executeRawUnsafe.mock.calls.map(([sql]) => sql)).toEqual(["TRUNCATE TABLE `Patient`", "TRUNCATE TABLE `Session`"]);
    expect(seedDatabase).toHaveBeenCalledOnce();
  });
});
