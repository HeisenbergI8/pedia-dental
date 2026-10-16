import { Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentRequestStatus, CreateAppointmentRequestInput, type AppointmentRequest } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction } from "../prisma/transaction";
import { REQUEST_NOT_FOUND, requestRefusal } from "./appointment.rules";
import { REQUEST_COLUMNS, REQUEST_ORDER, toRequest } from "./request.rows";

/** features/appointments/mocks.ts:137–183. One pending request per child holds under the patient's lock. */
@Injectable()
export class AppointmentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** GET /appointment-requests: newest first; ?status= narrows when it parses (mocks.ts:140). Not audited (decision 6). */
  async list(status: unknown): Promise<AppointmentRequest[]> {
    const parsed = AppointmentRequestStatus.safeParse(status);
    const rows = await this.prisma.appointmentRequest.findMany({ where: parsed.success ? { status: parsed.data } : {}, select: REQUEST_COLUMNS, orderBy: REQUEST_ORDER });
    return rows.map(toRequest);
  }

  /** The pending requests' statuses: Today's request count (todaySummary counts them account-wide, as the mock). */
  async pending(): Promise<{ status: "pending" }[]> {
    return (await this.prisma.appointmentRequest.findMany({ where: { status: "pending" }, select: { id: true } })).map(() => ({ status: "pending" }));
  }

  /** GET /patients/:id/appointment-requests: newest first; an unknown patient has none. Audited per child. */
  async forPatient(patientId: string): Promise<AppointmentRequest[]> {
    const rows = await this.prisma.appointmentRequest.findMany({ where: { patientId }, select: REQUEST_COLUMNS, orderBy: REQUEST_ORDER });
    await this.audit.record("view", "Appointment requests", patientId);
    return rows.map(toRequest);
  }

  /** POST /patients/:id/appointment-requests: lock (404) → 400 body → 400 date → 409 pending. 201. */
  async create(patientId: string, body: unknown, guardianId: string | undefined): Promise<AppointmentRequest> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const input = new ZodValidationPipe(CreateAppointmentRequestInput).transform(body);
      const pending = await tx.appointmentRequest.findFirst({ where: { patientId, status: "pending" }, select: { id: true } });
      refuse(requestRefusal(input.preferredDate, this.clock.today(), !!pending));
      const row = await tx.appointmentRequest.create({
        data: {
          ...clinicData(), patientId, guardianId: guardianId ?? (await this.patients.primaryGuardianId(tx, patientId)),
          preferredDate: new Date(`${input.preferredDate}T00:00:00.000Z`), timeOfDay: input.timeOfDay, reason: input.reason,
          note: input.note ?? null, status: "pending", createdAt: this.clock.now(),
        },
        select: REQUEST_COLUMNS,
      });
      await this.audit.record("create", "Appointment request", patientId, tx);
      return toRequest(row);
    });
  }

  /** POST /appointment-requests/:id/handled: 404, else handled (again: 200, as the mock). Idempotent, so no lock. */
  async handled(id: string): Promise<AppointmentRequest> {
    return runInTransaction(this.prisma, async (tx) => {
      const found = await tx.appointmentRequest.findUnique({ where: { id }, select: { patientId: true } });
      if (!found) throw new NotFoundException(REQUEST_NOT_FOUND);
      const row = await tx.appointmentRequest.update({ where: { id }, data: { status: "handled" }, select: REQUEST_COLUMNS });
      await this.audit.record("update", "Appointment request", found.patientId, tx);
      return toRequest(row);
    });
  }
}
