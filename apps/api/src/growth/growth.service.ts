import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { SaveGrowthInput, type GrowthRecord } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Prisma } from "../generated/prisma/client.ts";
import { lockPatient } from "../patients/patient-lock";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction } from "../prisma/transaction";
import { VISIT_NOT_FOUND, VisitsService } from "../visits/visits.service";
import { GROWTH_COLUMNS, GROWTH_ORDER, toGrowth } from "./growth.rows";

/** features/growth/mocks.ts. One record per visit; re-saving replaces it. The timeline is habitTimeline() in the web. */
@Injectable()
export class GrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly visits: VisitsService,
    private readonly clock: Clock,
  ) {}

  /** GET /patients/:id/growth, oldest first. [] for an unknown patient, as the mock. Audited (decision 7). */
  async list(patientId: string): Promise<GrowthRecord[]> {
    const rows = await this.prisma.growthRecord.findMany({ where: { patientId }, select: GROWTH_COLUMNS, orderBy: [...GROWTH_ORDER] });
    await this.audit.record("view", "Growth and habits", patientId);
    return rows.map(toGrowth);
  }

  /** PUT /visits/:id/growth: the mock's order, 404 → 409 → 400, then create or replace under the patient's lock. */
  async save(visitId: string, body: unknown): Promise<GrowthRecord> {
    const patientId = await this.visits.patientOf(visitId); // outside the transaction (decision 3)
    if (!patientId) throw new NotFoundException(VISIT_NOT_FOUND);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // first statement: the snapshot starts after it
      const visit = await this.visits.one(tx, visitId);
      if (visit?.status !== "in_progress") throw new ConflictException("Growth is recorded during a visit in progress");
      const input = new ZodValidationPipe(SaveGrowthInput).transform(body);
      // A replace keeps the id and drops an unsent `speech`, as the mock's whole-record swap (growth/mocks.ts:28–36).
      const data = { habits: input.habits as Prisma.InputJsonArray, speech: input.speech ?? null, recordedAt: this.clock.now() };
      const existing = await tx.growthRecord.findFirst({ where: { visitId }, select: { id: true } });
      const row = existing
        ? await tx.growthRecord.update({ where: { id: existing.id }, data, select: GROWTH_COLUMNS })
        : await tx.growthRecord.create({ data: { ...clinicData(), patientId, visitId, ...data }, select: GROWTH_COLUMNS });
      await this.audit.record("update", "Growth and habits", patientId, tx);
      return toGrowth(row);
    });
  }
}
