import { NotFoundException } from "@nestjs/common";
import { requireContext } from "../common/request-context";
import type { Tx } from "../prisma/transaction";
import { PATIENT_NOT_FOUND } from "./patients.service";

/**
 * Locks one patient's row until the transaction ends; false when this clinic has no such patient. Every patient write
 * takes it first (B4), and so does every visit and chart write (B5, decision 5): one visit in progress and one correction
 * per entry then hold under parallel requests. Account before patient, never the other way round. Raw SQL names
 * clinicId itself.
 *
 * Take it before any plain read in the transaction. InnoDB's snapshot starts at the first plain read, so a read before
 * the lock would leave every later read blind to what the request that held the lock just committed.
 */
export async function lockPatientIfExists(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Patient WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
  return rows.length > 0;
}

/** lockPatientIfExists, or 404 in the mock's words. */
export async function lockPatient(tx: Tx, id: string): Promise<void> {
  if (!(await lockPatientIfExists(tx, id))) throw new NotFoundException(PATIENT_NOT_FOUND);
}
