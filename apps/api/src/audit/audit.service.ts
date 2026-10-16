import { Injectable } from "@nestjs/common";
import type { AuditAction } from "@pedia/shared";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import type { Tx } from "../prisma/transaction";

/** Looking at the same record again within this window (a refetch, a tab switch) isn't logged twice. */
export const REPEAT_WINDOW_MS = 5 * 60_000;

/** The audit trail (RA 10173): who touched which personal data, and when. Insert-only by the tenant extension. */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Appends one entry for the signed-in user. Views repeat-suppressed for five minutes; changes always written
   * (port of `recordAudit`, apps/web/src/mocks/access.ts). Pass `tx` to record it in the same transaction as
   * the change it describes, so a rolled-back change leaves no entry.
   */
  async record(action: AuditAction, record: string, patientId?: string, tx: Tx = this.prisma): Promise<void> {
    const { user } = requireContext();
    if (!user) throw new Error("An audit entry needs a signed-in user in the request context.");
    const at = this.clock.now();

    if (action === "view") {
      const repeat = await tx.auditEvent.findFirst({
        where: {
          actorId: user.id,
          action,
          record,
          patientId: patientId ?? null,
          at: { gt: new Date(at.getTime() - REPEAT_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (repeat) return;
    }

    await tx.auditEvent.create({
      data: { ...clinicData(), at, actorId: user.id, actorName: user.name, actorRole: user.role, action, record, patientId },
      select: { id: true },
    });
  }
}
