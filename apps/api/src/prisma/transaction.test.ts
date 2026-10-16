import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/client.ts";
import { isWriteConflict, runInTransaction } from "./transaction";

const conflict = () => new Prisma.PrismaClientKnownRequestError("deadlock", { code: "P2034", clientVersion: "7.10.0" });
/** What a deadlock inside a raw query looks like through the MariaDB adapter (seen against MySQL 8.0). */
const rawConflict = (kind = "TransactionWriteConflict") =>
  new Prisma.PrismaClientKnownRequestError("raw query failed", {
    code: "P2010",
    clientVersion: "7.10.0",
    meta: { driverAdapterError: { cause: { originalCode: "1213", kind } } },
  });

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

  it("reruns after a deadlock inside a raw query (P2010 wrapping a write conflict)", async () => {
    const client = fakeClient([rawConflict()]);
    await expect(runInTransaction(client, async () => "done")).resolves.toBe("done");
    expect(client.$transaction).toHaveBeenCalledTimes(2);
  });

  it("tells write conflicts from other raw-query failures", () => {
    expect(isWriteConflict(conflict())).toBe(true);
    expect(isWriteConflict(rawConflict())).toBe(true);
    expect(isWriteConflict(rawConflict("UniqueConstraintViolation"))).toBe(false);
    expect(isWriteConflict(new Error("P2034"))).toBe(false);
  });

  it("never retries any other error", async () => {
    const client = fakeClient([new Error("unique constraint")]);
    await expect(runInTransaction(client, async () => "done")).rejects.toThrow("unique constraint");
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});
