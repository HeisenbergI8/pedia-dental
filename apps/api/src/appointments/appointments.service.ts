import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { ChangeAppointmentStatusInput, RescheduleAppointmentInput, rolesCan, type Appointment, type BookAppointmentInput, type Role } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import { lockAccount } from "../clinic/account-lock";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MessageQueueService } from "../message-queue/message-queue.service";
import { lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { DueItemsService } from "../recalls/due-items.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { AppointmentRecordsService } from "./appointment-records.service";
import { byStartThenChair } from "./appointment.rows";
import { APPOINTMENT_NOT_FOUND, moveRefusal, slotRefusal, statusRefusal } from "./appointment.rules";

const FAR_FUTURE = 8.64e15; // the mock's default `to` (mocks.ts:60)
// MySQL's DATETIME range: a bound outside it matches nothing there, where the mock's comparison matches everything.
const [EARLIEST, LATEST] = [Date.parse("1000-01-01T00:00:00Z"), Date.parse("9999-12-31T23:59:59Z")];
/** A bound as given (an unparsable one is Invalid Date), clamped into what MySQL can compare. */
const at = (v: string | undefined, fallback: number) => {
  const t = new Date(v ?? fallback).getTime();
  return new Date(Number.isNaN(t) ? t : Math.min(Math.max(t, EARLIEST), LATEST));
};

/**
 * features/appointments/mocks.ts. No double-booking (E1): book and move take the clinic's lock first, then read the
 * live appointments near the slot and run findConflict, then write, all in one transaction.
 */
@Injectable()
export class AppointmentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: AppointmentRecordsService,
    private readonly clinic: ClinicService,
    private readonly audit: AuditService,
    private readonly owners: RecordOwners,
    private readonly dueItems: DueItemsService,
    private readonly patients: PatientsService,
    private readonly messages: MessageQueueService,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    // Decision 2: a parent may confirm their own child's appointment (appointments/mocks.ts:120–124; access.ts:198–205).
    this.owners.register("/appointments/:id/status", (id) => this.records.patientOf(id));
  }

  /** GET /appointments: the device's branch, [from, to), by start then chair (decision 5). Not audited (decision 6). */
  async calendar(from?: string, to?: string): Promise<Appointment[]> {
    const lo = at(from, 0), hi = at(to, FAR_FUTURE);
    if (Number.isNaN(lo.getTime()) || Number.isNaN(hi.getTime())) return []; // the mock's NaN comparisons match nothing
    const rows = await this.records.inWindow([requireContext().branchId!], lo, hi);
    return rows.sort(byStartThenChair((await this.clinic.scheduleRefs(this.prisma)).chairOrder));
  }

  /** GET /patients/:id/appointments: every branch, by start. Audited per child (decision 6). */
  async forPatient(patientId: string): Promise<Appointment[]> {
    const rows = await this.records.forPatients([patientId]);
    await this.audit.record("view", "Appointments", patientId);
    return rows;
  }

  /** POST /appointments: 400 body (pipe) → lock → 404 → slot refusals → 409 → write. 201. */
  async book(input: BookAppointmentInput): Promise<Appointment> {
    const branchId = requireContext().branchId!; // the device's branch (the mock's activeBranch)
    return runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx); // E1: the first statement, so the snapshot sees every booking committed before ours
      await lockPatient(tx, input.patientId); // 404 "Patient not found"; E2: account → patient
      const slot = { ...input, id: "", branchId, status: "booked" as const };
      const refs = await this.clinic.scheduleRefs(tx);
      refuse(slotRefusal(slot, { ...refs, existing: await this.records.near(tx, slot) }));
      const { id: _, ...data } = slot;
      const booked = await this.records.create(tx, { ...clinicData(), ...data, procedureCode: input.procedureCode ?? null, sourceRuleId: input.sourceRuleId ?? null });
      // Booked from the due list: the patient's earliest open item for that rule is now booked (mocks.ts:85–91).
      await this.dueItems.takeFor(tx, booked);
      // A confirmation now, a reminder the day before, pre-visit instructions with it (mocks.ts:92), in this transaction.
      await this.messages.queueBooking(tx, booked, await this.patients.one(input.patientId, tx));
      await this.audit.record("create", "Appointment", input.patientId, tx);
      return booked;
    });
  }

  /** PUT /appointments/:id: lock → 404 → 400 body → 409 status → slot refusals → write. */
  async move(id: string, body: unknown): Promise<Appointment> {
    const patientId = await this.records.patientOf(id); // outside the transaction (B6 decision 3)
    if (!patientId) throw new NotFoundException(APPOINTMENT_NOT_FOUND);
    return runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx); // E1
      await lockPatient(tx, patientId); // B9: account → patient → appointment, so a reminders "no" can't interleave
      const current = await this.records.lockOne(tx, id);
      if (!current) throw new NotFoundException(APPOINTMENT_NOT_FOUND);
      const input = new ZodValidationPipe(RescheduleAppointmentInput).transform(body);
      refuse(moveRefusal(current.status));
      const moved = { ...current, ...input };
      refuse(slotRefusal(moved, { ...(await this.clinic.scheduleRefs(tx)), existing: await this.records.near(tx, moved) }));
      const row = await this.records.update(tx, id, input);
      // The old time's texts must not go out; the new time's are queued (mocks.ts:109–110, decision 7, E13).
      await this.messages.withdrawAppointment(tx, id);
      await this.messages.queueBooking(tx, row, await this.patients.one(current.patientId, tx));
      await this.audit.record("update", "Appointment", current.patientId, tx);
      return row;
    });
  }

  /** POST /appointments/:id/status: 404 → 400 body → 403 confirm-only → 409 transition. Patient lock, not the clinic's (E1). */
  async setStatus(id: string, body: unknown, roles: readonly Role[]): Promise<Appointment> {
    const patientId = await this.records.patientOf(id); // outside the transaction (B6 decision 3)
    if (!patientId) throw new NotFoundException(APPOINTMENT_NOT_FOUND);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // first statement; E2: patient → appointment
      const current = (await this.records.one(tx, id))!;
      const input = new ZodValidationPipe(ChangeAppointmentStatusInput).transform(body);
      refuse(statusRefusal(current.status, input, rolesCan(roles, "appointments.manage")));
      const row = await this.records.update(tx, id, { status: input.status, ...(input.status === "cancelled" && { cancelReason: input.cancelReason }) });
      // Decision 7: a cancelled or missed visit withdraws what it queued; a no-show also queues the missed text (mocks.ts:129–132).
      if (row.status === "cancelled" || row.status === "no_show") await this.messages.withdrawAppointment(tx, id);
      if (row.status === "no_show") {
        const missed = { kind: "missed_appointment" as const, patientId, appointmentId: id, startsAt: row.startsAt, dentistId: row.dentistId, sendAt: this.clock.now().toISOString() };
        await this.messages.queue(tx, missed, await this.patients.one(patientId, tx));
      }
      await this.audit.record("update", "Appointment status", patientId, tx);
      return row;
    });
  }
}
