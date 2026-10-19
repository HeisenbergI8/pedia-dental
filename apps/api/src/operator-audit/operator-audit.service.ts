import { Injectable, Logger } from "@nestjs/common";
import type { AuditAction } from "@pedia/shared";
import { Clock } from "../common/clock";
import { errorFingerprint } from "../common/process-errors";
import { requireContext } from "../common/request-context";
import { MetricsService } from "../metrics/metrics.service";
import { PrismaService } from "../prisma/prisma.service";

/** The platform audit trail (B13a, F1): one row per operator action. Insert-only (APPEND_ONLY), but for `prune` (B13c2a). */
/** The shortest period the operator trail may be pruned to (one year; confirm with counsel, decisions.md C2). */
export const OPERATOR_AUDIT_MIN_KEEP_DAYS = 365;

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

  /**
   * B13c2a (decisions.md E10): the only delete on an append-only table. Rows older than `keepDays`, 1,000 at a time.
   * Raw SQL on purpose: the tenant extension refuses any Prisma delete here, which keeps every other path insert-only.
   */
  async prune(keepDays: number, now = this.clock.now()): Promise<number> {
    // The same floor env.ts holds OPERATOR_AUDIT_KEEP_DAYS to, here too: no caller can empty the trail by mistake.
    if (!Number.isInteger(keepDays) || keepDays < OPERATOR_AUDIT_MIN_KEEP_DAYS) throw new Error(`Refusing to prune the operator trail to under ${OPERATOR_AUDIT_MIN_KEEP_DAYS} days`);
    const before = new Date(now.getTime() - keepDays * 24 * 60 * 60_000).toISOString().slice(0, 23).replace("T", " ");
    let total = 0;
    for (;;) {
      const n = await this.prisma.$executeRaw`DELETE FROM OperatorAuditEvent WHERE at < ${before} LIMIT 1000`;
      total += n;
      if (n < 1000) return total;
    }
  }
}
