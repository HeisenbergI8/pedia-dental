import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { StartVisitInput, type Visit } from "@pedia/shared";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { APPOINTMENT_NOT_FOUND } from "../appointments/appointment.rules";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
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
export class VisitsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clinic: ClinicService,
    private readonly clock: Clock,
    private readonly appointments: AppointmentRecordsService,
    private readonly owners: RecordOwners,
  ) {}

  /** B13c2b: the guard finds a restricted child behind a visit route (and a parent's, were they ever allowed). */
  onModuleInit() {
    for (const path of ["/visits/:id/complete", "/visits/:id/growth"]) this.owners.register(path, (id) => this.patientOf(id));
  }

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
      // Starting from an appointment seats the child: arrived → in chair (visits/mocks.ts:31–41). Under the patient's
      // lock, as every status change (E2), so a parallel cancel or second start sees the result.
      if (input.appointmentId) {
        const appointment = await this.appointments.one(tx, input.appointmentId);
        if (!appointment || appointment.patientId !== patientId) throw new NotFoundException(APPOINTMENT_NOT_FOUND);
        if (!(await this.appointments.advance(tx, appointment.id, "arrived", "in_chair"))) {
          throw new ConflictException("Check the patient in before starting the visit");
        }
      }
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
      const { status, appointmentId } = await tx.visit.findUniqueOrThrow({ where: { id }, select: { status: true, appointmentId: true } });
      if (status !== "in_progress") throw new ConflictException("Visit is already completed");
      // The appointment it was started from: in chair → done (visits/mocks.ts:63–64). Any other status (or a pre-B7 id
      // that names nothing) is left as it is, as the mock.
      if (appointmentId) await this.appointments.advance(tx, appointmentId, "in_chair", "done");
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

  /**
   * The patient a visit belongs to, read outside any transaction (B6 decision 3). `patientId` never changes and visits
   * are never deleted, so the caller opens its transaction with lockPatient and re-reads the visit under it: the lock is
   * the transaction's first statement, so its snapshot sees what the previous lock holder committed. undefined for an
   * unknown visit or another clinic's (tenant extension).
   */
  async patientOf(id: string): Promise<string | undefined> {
    const row = await this.prisma.visit.findUnique({ where: { id }, select: { patientId: true } });
    return row?.patientId;
  }

  /** One visit by id, read in the caller's transaction after its lock. */
  async one(tx: Tx, id: string): Promise<Visit | undefined> {
    const row = await tx.visit.findUnique({ where: { id }, select: VISIT_COLUMNS });
    return row ? toVisit(row) : undefined;
  }

  /** Each visit's dentist (a due item's `dentistId`, through the visit stored on it: E6). One query. */
  async dentistsOf(visitIds: readonly string[]): Promise<Map<string, string>> {
    if (!visitIds.length) return new Map();
    const rows = await this.prisma.visit.findMany({ where: { id: { in: [...new Set(visitIds)] } }, select: { id: true, dentistId: true } });
    return new Map(rows.map((r) => [r.id, r.dentistId]));
  }

  /** Each visit's day as yyyy-MM-dd (the backfill's visitDate). One query. */
  async datesOf(tx: Tx, visitIds: readonly string[]): Promise<Map<string, string>> {
    if (!visitIds.length) return new Map();
    const rows = await tx.visit.findMany({ where: { id: { in: [...new Set(visitIds)] } }, select: { id: true, date: true } });
    return new Map(rows.map((r) => [r.id, r.date.toISOString().slice(0, 10)]));
  }

  /** Visit id → the appointment it was started from (an invoice's appointmentId). One query. */
  async appointmentsOf(tx: Tx, visitIds: readonly string[]): Promise<Map<string, string | undefined>> {
    if (!visitIds.length) return new Map();
    const rows = await tx.visit.findMany({ where: { id: { in: [...new Set(visitIds)] } }, select: { id: true, appointmentId: true } });
    return new Map(rows.map((r) => [r.id, r.appointmentId ?? undefined]));
  }
}
