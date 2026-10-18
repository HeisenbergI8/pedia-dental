import { Injectable, Logger } from "@nestjs/common";
import type { AuditAction } from "@pedia/shared";
import { Clock } from "../common/clock";
import { errorFingerprint } from "../common/process-errors";
import { requireContext } from "../common/request-context";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";

/** The platform audit trail (B13a, F1): one row per operator action. Insert-only (APPEND_ONLY). */
@Injectable()
export class OperatorAuditService {
  private readonly log = new Logger(OperatorAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly metrics: MetricsService,
  ) {}

  /** For the signed-in operator (the guard set `operatorId` from pd_operator). */
  async record(action: AuditAction, record: string, detail: string, targetId?: string): Promise<void> {
    const { operatorId } = requireContext();
    if (!operatorId) throw new Error("An operator audit entry needs a signed-in operator in the request context.");
    const operator = await this.prisma.operatorUser.findUniqueOrThrow({ where: { id: operatorId }, select: { id: true, name: true } });
    await this.recordFor(operator, action, record, detail, targetId);
  }

  /** For an operator who isn't in the context yet: sign-in and a failed sign-in. */
  async recordFor(operator: { id: string; name: string }, action: AuditAction, record: string, detail: string, targetId?: string): Promise<void> {
    await this.prisma.operatorAuditEvent.create({
      data: { at: this.clock.now(), operatorId: operator.id, operatorName: operator.name, action, record, detail, targetId },
      select: { id: true },
    });
  }

  /** Decision E9: the action already happened, so a failed insert is logged and counted, never failing the request. */
  tryRecord(action: AuditAction, record: string, detail: string, targetId?: string): Promise<void> {
    return this.safely(detail, () => this.record(action, record, detail, targetId));
  }

  tryRecordFor(operator: { id: string; name: string }, action: AuditAction, record: string, detail: string): Promise<void> {
    return this.safely(detail, () => this.recordFor(operator, action, record, detail));
  }

  private async safely(detail: string, write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      this.metrics.countUnhandled();
      this.log.error({ fingerprint: errorFingerprint(error) }, `Operator audit row not written (${detail})`);
    }
  }
}
