import { Injectable } from "@nestjs/common";
import { ANONYMISED, type Appointment, type AppointmentStatus } from "@pedia/shared";
import { requireContext } from "../common/request-context";
import type { Prisma } from "../generated/prisma/client.ts";
import { StandingRefresh } from "../patients/standing-refresh";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";
import { APPOINTMENT_COLUMNS, toAppointment } from "./appointment.rows";
import { LIVE } from "./appointment.rules";

const DAY_MS = 86_400_000;
/** The mock's UPCOMING (clinic/mocks.ts:63): what blocks archiving a branch. */
const UPCOMING: AppointmentStatus[] = ["booked", "confirmed", "arrived", "in_chair"];
/** B14: the statuses that change a child's last visit or open due items (isDueItemOpen): entering one refreshes them. */
const STANDING: readonly AppointmentStatus[] = ["done", "cancelled", "no_show"];

/** The only code that reads or writes `Appointment` (E4). Prisma only, so every feature can import it. */
@Injectable()
export class AppointmentRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly standing: StandingRefresh) {}

  /** The branch's appointments starting in [from, to), by start (the service sorts ties by chair). */
  async inWindow(branchIds: readonly string[], from: Date, to: Date, db: Tx = this.prisma): Promise<Appointment[]> {
    const rows = await db.appointment.findMany({
      where: { branchId: { in: [...branchIds] }, startsAt: { gte: from, lt: to } }, select: APPOINTMENT_COLUMNS, orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toAppointment);
  }

  /** Every branch's appointments for some patients (GET /patients/:id/appointments, done days, isDueItemOpen). */
  async forPatients(patientIds: readonly string[], where: Prisma.AppointmentWhereInput = {}, db: Tx = this.prisma): Promise<Appointment[]> {
    if (!patientIds.length) return [];
    const rows = await db.appointment.findMany({ where: { ...where, patientId: { in: [...patientIds] } }, select: APPOINTMENT_COLUMNS, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
    return rows.map(toAppointment);
  }

  /** The appointment's patient, outside any transaction (B6 decision 3: patientId never changes, nothing is deleted). */
  async patientOf(id: string): Promise<string | undefined> {
    return (await this.prisma.appointment.findUnique({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** One appointment, read in the caller's transaction after its lock. */
  async one(tx: Tx, id: string): Promise<Appointment | undefined> {
    const row = await tx.appointment.findUnique({ where: { id }, select: APPOINTMENT_COLUMNS });
    return row ? toAppointment(row) : undefined;
  }

  /** A locking read (the move's first read after the clinic lock, E2). Raw SQL names clinicId itself. */
  async lockOne(tx: Tx, id: string): Promise<Appointment | undefined> {
    const [hit] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Appointment WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
    return hit ? this.one(tx, id) : undefined;
  }

  /**
   * The live appointments that could clash with a slot: the same chair or the same dentist, at any branch, starting
   * within a day before the slot's end. outsideClinicHours runs first, so no appointment is a day long. findConflict
   * makes the exact call. Read after lockAccount (E1).
   */
  async near(tx: Tx, slot: Pick<Appointment, "chairId" | "dentistId" | "startsAt" | "durationMin">): Promise<Appointment[]> {
    const start = new Date(slot.startsAt).getTime();
    const end = start + slot.durationMin * 60_000;
    const rows = await tx.appointment.findMany({
      where: { OR: [{ chairId: slot.chairId }, { dentistId: slot.dentistId }], status: { in: LIVE }, startsAt: { gte: new Date(start - DAY_MS), lt: new Date(end) } },
      select: APPOINTMENT_COLUMNS,
    });
    return rows.map(toAppointment);
  }

  /** The writes below run under the patient's lock (their callers'), so the B14 standing refresh is too. */
  async create(tx: Tx, data: Prisma.AppointmentUncheckedCreateInput): Promise<Appointment> {
    const row = toAppointment(await tx.appointment.create({ data, select: APPOINTMENT_COLUMNS }));
    if (STANDING.includes(row.status)) await this.standing.refresh(tx, row.patientId, ["visit", "due"]); // a plain booking adds nothing
    return row;
  }

  async update(tx: Tx, id: string, data: Prisma.AppointmentUpdateInput): Promise<Appointment> {
    const row = toAppointment(await tx.appointment.update({ where: { id }, data, select: APPOINTMENT_COLUMNS }));
    if (data.status !== undefined) await this.standing.refresh(tx, row.patientId, ["visit", "due"]); // B14: a status change
    return row;
  }

  /** Moves `from` → `to` only while the status is still `from` (VisitsService: seat, done). True when it moved. */
  async advance(tx: Tx, id: string, from: AppointmentStatus, to: AppointmentStatus): Promise<boolean> {
    const moved = (await tx.appointment.updateMany({ where: { id, status: from }, data: { status: to } })).count === 1;
    if (moved && STANDING.includes(to)) {
      const { patientId } = await tx.appointment.findUniqueOrThrow({ where: { id }, select: { patientId: true } });
      await this.standing.refresh(tx, patientId, ["visit", "due"]); // B14
    }
    return moved;
  }

  /** Bookings still to come at a branch (archiveProblem's `upcoming`), from `now` on. */
  async upcomingAt(tx: Tx, branchId: string, now: Date): Promise<number> {
    return tx.appointment.count({ where: { branchId, status: { in: UPCOMING }, startsAt: { gte: now } } });
  }

  /** B13c2b E7: a child's bookings still to come (the same statuses as upcomingAt). */
  async upcomingFor(tx: Tx, patientId: string, now: Date): Promise<number> {
    return tx.appointment.count({ where: { patientId, status: { in: UPCOMING }, startsAt: { gte: now } } });
  }

  /** B13c2b-2: an anonymised child's appointments keep their times, chair and status; their free text goes. Under the patient's lock. */
  async anonymiseFor(tx: Tx, patientId: string): Promise<void> {
    await tx.appointment.updateMany({ where: { patientId }, data: { reason: ANONYMISED, cancelReason: null } });
  }
}
