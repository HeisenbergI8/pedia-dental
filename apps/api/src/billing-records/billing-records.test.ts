import { describe, expect, it } from "vitest";
import { requestContext } from "../common/request-context";
import type { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";
import { BillingRecordsService } from "./billing-records.service";

/** The shaping around the queries; their behaviour on MySQL is idempotency.int (receipts) and billing.int. */
describe("BillingRecordsService", () => {
  const records = new BillingRecordsService({} as PrismaService);
  const inClinic = <T>(fn: () => Promise<T>) => requestContext.run({ requestId: "t", clinicId: "c1", operator: false }, fn);

  it("formats the counter's number, a bigint from the driver, as a receipt", async () => {
    const tx = { $executeRaw: async () => 1, $queryRaw: async () => [{ last: 3n }] } as unknown as Tx;
    expect(await inClinic(() => records.nextReceipt(tx, "AR"))).toBe("AR-000003");
  });

  it("reads a bill with no payments as nothing paid", async () => {
    const tx = { payment: { aggregate: async () => ({ _sum: { amount: null }, _count: 0 }) } } as unknown as Tx;
    expect(await records.paidOn(tx, "i1")).toEqual({ all: 0, credit: 0, rows: 0 });
  });
});
