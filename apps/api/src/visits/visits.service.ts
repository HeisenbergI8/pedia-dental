import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { StartVisitInput, type Visit } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { lockPatient } from "../patients/patient-lock";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { VISIT_COLUMNS, toVisit } from "./visit.rows";

export const VISIT_NOT_FOUND = "Visit not found"; // visits/mocks.ts:59

/** features/visits/mocks.ts. A visit is the only clinical row that changes (completing it); everything else appends. */
@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clinic: ClinicService,
    private readonly clock: Clock,
  ) {}

  /** GET /patients/:id/visits, newest first (mocks.ts:13). An unknown patient has none: [], as the mock. Audited (decision 6). */
  async list(patientId: string): Promise<Visit[]> {
    const rows = await this.prisma.visit.findMany({ where: { patientId }, select: VISIT_COLUMNS, orderBy: [{ startedAt: "desc" }, { id: "desc" }] });
    await this.audit.record("view", "Visits", patientId);
    return rows.map(toVisit);
  }

  /** POST /patients/:id/visits: the mock's order, 404 → 400 → 400 "Unknown dentist" → 409, under the patient's lock. */
  async start(patientId: string, body: unknown): Promise<Visit> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const input = new ZodValidationPipe(StartVisitInput).transform(body);
      if (!(await this.clinic.isActiveDentist(input.dentistId, tx))) throw new BadRequestException("Unknown dentist");
      const open = await tx.visit.findFirst({ where: { patientId, status: "in_progress" }, select: { id: true } });
      if (open) throw new ConflictException("This patient already has a visit in progress");
      // Decision 1: stored as given. B7 checks the appointment (404 / 409) and seats it here, in this transaction.
      const row = await tx.visit.create({
        data: {
          ...clinicData(), patientId, dentistId: input.dentistId, appointmentId: input.appointmentId ?? null,
          date: new Date(`${this.clock.today()}T00:00:00.000Z`), status: "in_progress", startedAt: this.clock.now(),
        },
        select: VISIT_COLUMNS,
      });
      await this.audit.record("create", "Visit", patientId, tx);
      return toVisit(row);
    });
  }

  /** POST /visits/:id/complete. The status is re-read under the patient's lock, so a chart write can't slip in after it. */
  async complete(id: string): Promise<Visit> {
    return runInTransaction(this.prisma, async (tx) => {
      // A locking read first (visit, then patient): a plain read here would start the snapshot before the lock, and the
      // status re-read below would miss a parallel completion (patient-lock.ts). Raw SQL names clinicId itself.
      const [found] = await tx.$queryRaw<{ patientId: string }[]>`SELECT patientId FROM Visit WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
      if (!found) throw new NotFoundException(VISIT_NOT_FOUND);
      await lockPatient(tx, found.patientId);
      const { status } = await tx.visit.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (status !== "in_progress") throw new ConflictException("Visit is already completed");
      // B7: the appointment it was started from moves from in chair to done here (visits/mocks.ts:63).
      const row = await tx.visit.update({ where: { id }, data: { status: "completed", completedAt: this.clock.now() }, select: VISIT_COLUMNS });
      await this.audit.record("update", "Visit (completed)", found.patientId, tx);
      return toVisit(row);
    });
  }

  /** The chart's visit lookup: this patient's visit with this id, read in the caller's transaction (after its lock). */
  async forPatient(tx: Tx, visitId: string, patientId: string): Promise<Visit | undefined> {
    const row = await tx.visit.findFirst({ where: { id: visitId, patientId }, select: VISIT_COLUMNS });
    return row ? toVisit(row) : undefined;
  }
}
