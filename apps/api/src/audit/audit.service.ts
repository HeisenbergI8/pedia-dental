import { BadRequestException, Injectable } from "@nestjs/common";
import { type AuditAction, type AuditEvent, type AuditLogQuery, type Role, auditCursor, readAuditCursor } from "@pedia/shared";
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

  /**
   * An entry for someone who isn't signed in, at a time that already happened: a new clinic's first event, the Owner's
   * acceptance of the Terms and DPA when they signed up (B12, privacy #23). In the context's clinic, in the caller's `tx`.
   */
  async recordFor(tx: Tx, actor: { id: string; name: string; role: Role }, action: AuditAction, record: string, at: Date): Promise<void> {
    await tx.auditEvent.create({
      data: { ...clinicData(), at, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, record },
      select: { id: true },
    });
  }

  /**
   * B13c2a: one page of the clinic's trail, newest first (GET /audit-log). Keyset on (at, id) over the
   * (clinicId, at) / (clinicId, actorId, at) / (clinicId, patientId, at) indexes: no OFFSET, no COUNT.
   */
  async page(query: AuditLogQuery): Promise<{ rows: AuditEvent[]; next?: string }> {
    const after = query.before ? readAuditCursor(query.before) : undefined;
    if (query.before && !after) throw new BadRequestException("This page link has expired. Reload the audit log.");
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        ...(query.action && { action: query.action }),
        ...(query.actorId && { actorId: query.actorId }),
        ...(query.patientId && { patientId: query.patientId }),
        ...(after && { OR: [{ at: { lt: new Date(after.at) } }, { at: new Date(after.at), id: { lt: after.id } }] }),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: query.limit + 1, // one more says whether there is a next page
      select: { id: true, clinicId: true, at: true, actorId: true, actorName: true, actorRole: true, action: true, record: true, patientId: true },
    });
    const page = rows.slice(0, query.limit).map((r) => ({ ...r, at: r.at.toISOString(), patientId: r.patientId ?? undefined }));
    return { rows: page, ...(rows.length > query.limit && { next: auditCursor(page[page.length - 1]!) }) };
  }
}
