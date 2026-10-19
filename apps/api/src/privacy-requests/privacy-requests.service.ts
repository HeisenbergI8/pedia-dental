import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  PrivacyRequest, PrivacyRequestPage, addWorkingDays, readRequestCursor, requestCursor,
  type ClosePrivacyRequestInput, type LogPrivacyRequestInput, type PrivacyRequestQuery,
} from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { lockAccount } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { ENV, type Env } from "../config/env";
import type { PrivacyRequest as Row } from "../generated/prisma/client.ts";
import { PATIENT_NOT_FOUND, lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";

export const REQUEST_NOT_FOUND = "This request no longer exists.";
const day = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** B13c2b: the only reader and writer of PrivacyRequest. The Owner and admins (privacy.manage, access-rules.ts). */
@Injectable()
export class PrivacyRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly patients: PatientsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** E4: every open request, soonest due first; or a page of closed ones, newest closed first. Logged as a view. */
  async list(q: PrivacyRequestQuery): Promise<PrivacyRequestPage> {
    const after = q.before ? readRequestCursor(q.before) : undefined;
    if (q.before && !after) throw new BadRequestException("This page link has expired. Reload the requests."); // as GET /audit-log
    const rows =
      q.status === "open"
        ? await this.prisma.privacyRequest.findMany({ where: { status: "open" }, orderBy: [{ dueOn: "asc" }, { id: "asc" }] })
        : await this.prisma.privacyRequest.findMany({
            where: {
              status: { in: ["done", "declined"] },
              ...(after && { OR: [{ closedAt: { lt: new Date(after.at) } }, { closedAt: new Date(after.at), id: { lt: after.id } }] }),
            },
            orderBy: [{ closedAt: "desc" }, { id: "desc" }],
            take: q.limit + 1,
          });
    const page = q.status === "open" ? rows : rows.slice(0, q.limit);
    const names = await this.patients.namesOf(page.flatMap((r) => (r.patientId ? [r.patientId] : [])));
    await this.audit.record("view", "Privacy requests"); // the mock gate's entry; repeat-suppressed
    const requests = page.map((r) => this.view(r, names));
    return PrivacyRequestPage.parse({ requests, ...(q.status === "closed" && rows.length > q.limit && { next: requestCursor(requests.at(-1)!) }) });
  }

  /** POST /privacy-requests: 404 for an unknown child, 409 for a day after today; the deadline stored now (E3). */
  async log(input: LogPrivacyRequestInput): Promise<PrivacyRequest> {
    if (input.receivedOn > this.clock.today()) throw new ConflictException("The day it was received can't be after today");
    if (input.patientId && !(await this.patients.exists(input.patientId))) throw new NotFoundException(PATIENT_NOT_FOUND);
    const { user } = requireContext();
    const row = await this.prisma.privacyRequest.create({
      data: {
        ...clinicData(), patientId: input.patientId, kind: input.kind, requesterName: input.requesterName,
        relationship: input.relationship || null, channel: input.channel, details: input.details || null,
        receivedOn: asDate(input.receivedOn), dueOn: asDate(addWorkingDays(input.receivedOn, this.env.PRIVACY_REQUEST_DUE_WORKING_DAYS)),
        loggedById: user!.id, loggedByName: user!.name, loggedAt: this.clock.now(),
      },
    });
    await this.audit.record("create", "Privacy request", input.patientId);
    return this.view(row, await this.patients.namesOf(row.patientId ? [row.patientId] : []));
  }

  /**
   * POST /privacy-requests/:id/close: once (409 after). Lock order account → patient → request (CONVENTIONS: account
   * before patient; the request's child never changes, so it is read before the transaction, B6 decision 3's shape).
   */
  async close(id: string, input: ClosePrivacyRequestInput): Promise<PrivacyRequest> {
    const found = await this.prisma.privacyRequest.findUnique({ where: { id }, select: { patientId: true, kind: true } });
    if (!found) throw new NotFoundException(REQUEST_NOT_FOUND);
    const restricts = found.kind === "erasure" && input.status === "done";
    const row = await runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx);
      if (restricts) await lockPatient(tx, found.patientId!);
      const current = await this.lockRequest(tx, id);
      if (current.status !== "open") throw new ConflictException("This request is already closed");
      // Step 3.4: if (restricts) await this.restrict(tx, found.patientId!);
      const { user } = requireContext();
      const closed = await tx.privacyRequest.update({
        where: { id },
        data: { status: input.status, outcome: input.outcome, closedById: user!.id, closedByName: user!.name, closedAt: this.clock.now() },
      });
      await this.audit.record("update", "Privacy request (closed)", closed.patientId ?? undefined, tx);
      return closed;
    });
    return this.view(row, await this.patients.namesOf(row.patientId ? [row.patientId] : []));
  }

  private async lockRequest(tx: Tx, id: string): Promise<Row> {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM PrivacyRequest WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
    if (!locked) throw new NotFoundException(REQUEST_NOT_FOUND);
    return tx.privacyRequest.findUniqueOrThrow({ where: { id } });
  }

  private view(r: Row, names: Map<string, string>): PrivacyRequest {
    return PrivacyRequest.parse({
      id: r.id, clinicId: r.clinicId, kind: r.kind, requesterName: r.requesterName, channel: r.channel, status: r.status,
      receivedOn: day(r.receivedOn), dueOn: day(r.dueOn), loggedByName: r.loggedByName, loggedAt: r.loggedAt.toISOString(),
      ...(r.patientId && { patientId: r.patientId, ...(names.has(r.patientId) && { patientName: names.get(r.patientId) }) }),
      ...(r.relationship && { relationship: r.relationship }),
      ...(r.details && { details: r.details }),
      ...(r.outcome && { outcome: r.outcome }),
      ...(r.closedByName && { closedByName: r.closedByName }),
      ...(r.closedAt && { closedAt: r.closedAt.toISOString() }),
    });
  }
}
