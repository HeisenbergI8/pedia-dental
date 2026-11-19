import { primolarInvoiceNo } from "@pedia/shared";
import type { Tx } from "../prisma/transaction";

/**
 * S10: one gapless PRM-INV sequence across the platform, for monthly invoices and text top-up acknowledgments (D10).
 * Always the last lock of its transaction (E6).
 */
export async function nextInvoiceNo(tx: Tx): Promise<string> {
  const [row] = await tx.$queryRaw<{ next: number | bigint }[]>`SELECT next FROM InvoiceCounter WHERE id = 'primolar' FOR UPDATE`;
  const next = Number(row?.next ?? 1);
  await tx.$executeRaw`INSERT INTO InvoiceCounter (id, next) VALUES ('primolar', ${next + 1}) ON DUPLICATE KEY UPDATE next = ${next + 1}`;
  return primolarInvoiceNo(next);
}
