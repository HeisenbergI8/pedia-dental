import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/client.ts";
import { runInTransaction } from "./transaction";

const conflict = () => new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "7.10.0" });

function fakeClient(failures: Error[]) {
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const failure = failures.shift();
    if (failure) throw failure;
    return fn({ tx: true });
  });
  return { $transaction } as unknown as Parameters<typeof runInTransaction>[0] & { $transaction: typeof $transaction };
}

describe("runInTransaction", () => {
  it("returns what the callback returns, given the transaction client", async () => {
    const client = fakeClient([]);
    await expect(runInTransaction(client, async (tx) => tx)).resolves.toEqual({ tx: true });
  });

  it("reruns the whole callback after a deadlock", async () => {
    const client = fakeClient([conflict()]);
    await expect(runInTransaction(client, async () => "done")).resolves.toBe("done");
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last attempt", async () => {
    const client = fakeClient([conflict(), conflict(), conflict()]);
    await expect(runInTransaction(client, async () => "done")).rejects.toMatchObject({ code: "P2034" });
    expect(client.$transaction).toHaveBeenCalledTimes(3);
  });

  it("never retries any other error", async () => {
    const client = fakeClient([new Error("unique constraint")]);
    await expect(runInTransaction(client, async () => "done")).rejects.toThrow("unique constraint");
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});
