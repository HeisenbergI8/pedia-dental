import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { AddPlanItemInput, SetPlanItemStatusInput, itemsCompletedBy, type PlanItem, type ToothNumber } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { lockPatient } from "../patients/patient-lock";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { PLAN_COLUMNS, PLAN_ORDER, toPlanItem } from "./plan.rows";
import { PLAN_ITEM_NOT_FOUND, addRefusal, statusRefusal } from "./plan.rules";

const OPEN = ["planned", "in_progress"] as const;

/**
 * features/plan/mocks.ts. Owns PlanItem. An item is `done` only through completeBy (a signed note, NotesService.sign);
 * progress is planProgress() in the web, never stored.
 */
@Injectable()
export class PlanService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clinic: ClinicService,
    private readonly clock: Clock,
    private readonly owners: RecordOwners,
  ) {}

  /** B13c2b: the guard finds a restricted child behind a plan item. */
  onModuleInit() {
    this.owners.register("/plan-items/:id", (id) => this.patientOf(id));
  }

  /** B13c2b: the item's child, for the guard. Undefined for an unknown item or another clinic's (tenant extension). */
  async patientOf(id: string): Promise<string | undefined> {
    return (await this.prisma.planItem.findUnique({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** GET /patients/:id/plan, oldest first. Parents reach only their own children (the guard, owner: id). Audited. */
  async list(patientId: string): Promise<PlanItem[]> {
    const rows = await this.prisma.planItem.findMany({ where: { patientId }, select: PLAN_COLUMNS, orderBy: [...PLAN_ORDER] });
    await this.audit.record("view", "Treatment plan", patientId);
    return rows.map(toPlanItem);
  }

  /** POST /patients/:id/plan: 404 → 400 issues → 400 "Unknown procedure" → 400 "… is planned per tooth". */
  async add(patientId: string, body: unknown): Promise<PlanItem> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // the 404, and every patient write locks first (CONVENTIONS → Traps)
      const input = new ZodValidationPipe(AddPlanItemInput).transform(body);
      refuse(addRefusal(await this.clinic.procedure(input.procedureCode, tx), input));
      const row = await tx.planItem.create({
        data: {
          ...clinicData(), patientId, procedureCode: input.procedureCode, tooth: input.tooth ?? null, fee: input.fee,
          status: "planned", sourceChartEntryId: input.sourceChartEntryId ?? null, createdAt: this.clock.now(),
        },
        select: PLAN_COLUMNS,
      });
      await this.audit.record("update", "Treatment plan", patientId, tx); // the rule's action override (access.ts:192)
      return toPlanItem(row);
    });
  }

  /** PATCH /plan-items/:id: 404 → 409 (done) → 400 (the body; "done" is refused by the schema). */
  async setStatus(id: string, body: unknown): Promise<PlanItem> {
    const owner = await this.prisma.planItem.findUnique({ where: { id }, select: { patientId: true } }); // decision 3
    if (!owner) throw new NotFoundException(PLAN_ITEM_NOT_FOUND);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, owner.patientId);
      refuse(statusRefusal(await tx.planItem.findUniqueOrThrow({ where: { id }, select: { status: true } })));
      const { status } = new ZodValidationPipe(SetPlanItemStatusInput).transform(body);
      // Guarded as well as locked: a done item never changes, even on a path that forgot the lock.
      const { count } = await tx.planItem.updateMany({ where: { id, status: { in: [...OPEN, "declined"] } }, data: { status } });
      if (count !== 1) refuse(statusRefusal({ status: "done" }));
      const row = await tx.planItem.findUniqueOrThrow({ where: { id }, select: PLAN_COLUMNS });
      await this.audit.record("update", "Treatment plan", owner.patientId, tx);
      return toPlanItem(row);
    });
  }

  /**
   * Completes the open items a signed note covers (itemsCompletedBy, notes/mocks.ts:74–79). Only NotesService.sign calls
   * it, inside its transaction and after it locked the patient, so the open items it reads can't change underneath.
   */
  async completeBy(tx: Tx, patientId: string, procedure: string, teeth: ToothNumber[], note: { id: string; visitId: string }): Promise<void> {
    const rows = await tx.planItem.findMany({ where: { patientId, status: { in: [...OPEN] } }, select: PLAN_COLUMNS, orderBy: [...PLAN_ORDER] });
    const ids = itemsCompletedBy(procedure, teeth, rows.map(toPlanItem)).map((i) => i.id);
    if (!ids.length) return;
    await tx.planItem.updateMany({
      where: { id: { in: ids }, status: { in: [...OPEN] } },
      data: { status: "done", completedVisitId: note.visitId, completedNoteId: note.id },
    });
  }

  /** A patient's plan items, in a caller's transaction (billing reads them under the patient's lock). */
  async items(tx: Tx, patientId: string): Promise<PlanItem[]> {
    return (await tx.planItem.findMany({ where: { patientId }, select: PLAN_COLUMNS, orderBy: [...PLAN_ORDER] })).map(toPlanItem);
  }
}
