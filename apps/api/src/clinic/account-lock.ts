import { requireContext } from "../common/request-context";
import type { Tx } from "../prisma/transaction";

/** The signed-in clinic. Behind the guard on every clinic route, so it is set. ClinicAccount is a platform table. */
export const ownClinicId = (): string => requireContext().clinicId!;

/**
 * Locks the signed-in clinic's account row until the transaction ends (B3, Decision 4). Every write whose rule is
 * checked first (a tier limit, the email check, the logo swap) takes it first, so two requests for one clinic run its
 * check and write one after the other. Another clinic is never blocked. `ClinicAccount` is Prisma's default table name
 * (CONVENTIONS → Decisions: table names).
 */
export async function lockAccount(tx: Tx): Promise<string> {
  const clinicId = ownClinicId();
  await tx.$queryRaw`SELECT id FROM ClinicAccount WHERE id = ${clinicId} FOR UPDATE`;
  return clinicId;
}
