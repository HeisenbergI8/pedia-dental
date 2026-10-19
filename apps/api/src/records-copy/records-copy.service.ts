import { Injectable } from "@nestjs/common";
import { RecordsCopy, copySections, type RecordsCopySection } from "@pedia/shared";
import { AppointmentRequestsService } from "../appointments/appointment-requests.service";
import { AppointmentsService } from "../appointments/appointments.service";
import { AuditService } from "../audit/audit.service";
import type { ClinicIdentity } from "../auth/identity.service";
import { InvoicesService } from "../billing/invoices.service";
import { PaymentsService } from "../billing/payments.service";
import { ChartService } from "../chart/chart.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { DocumentsService } from "../documents/documents.service";
import { GrowthService } from "../growth/growth.service";
import { MessagesService } from "../messages/messages.service";
import { NotesService } from "../notes/notes.service";
import { viewerOf } from "../patients/patient.views";
import { PatientsService } from "../patients/patients.service";
import { PhotosService } from "../photos/photos.service";
import { PlanService } from "../plan/plan.service";
import { VisitsService } from "../visits/visits.service";

/**
 * B13c2a: a child's copy of records. Composes each owner's own read, so every visibility rule (contact stripping, a
 * parent's live bills and own uploads) is the route's, never re-derived here. Those reads write their usual `view`
 * entries (repeat-suppressed); the copy adds one `export` "Copy of records" (decisions.md E4).
 */
@Injectable()
export class RecordsCopyService {
  constructor(
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly clinic: ClinicService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly chart: ChartService,
    private readonly notes: NotesService,
    private readonly growth: GrowthService,
    private readonly plan: PlanService,
    private readonly appointments: AppointmentsService,
    private readonly requests: AppointmentRequestsService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly messages: MessagesService,
    private readonly photos: PhotosService,
    private readonly documents: DocumentsService,
  ) {}

  async copy(who: ClinicIdentity, patientId: string): Promise<RecordsCopy> {
    const viewer = viewerOf(who);
    const patient = await this.patients.view(viewer, patientId); // the 404 for a child not in this clinic
    const { included, omitted } = copySections(who.user.roles);
    const read: Record<RecordsCopySection, () => Promise<unknown[]>> = {
      visits: () => this.visits.list(patientId),
      chart: () => this.chart.entries(patientId),
      notes: async () => (await this.notes.list(patientId)).filter((n) => n.signedAt), // a draft isn't the record yet (E5)
      growth: () => this.growth.list(patientId),
      plan: () => this.plan.list(patientId),
      appointments: () => this.appointments.forPatient(patientId),
      appointmentRequests: () => this.requests.forPatient(patientId),
      invoices: () => this.invoices.list(patientId, who),
      payments: () => this.payments.history(patientId),
      messages: () => this.messages.list(patientId, undefined),
      photos: () => this.photos.list(viewer, patientId),
      documents: () => this.documents.forPatient(patientId),
    };
    // One at a time: the reads audit through one connection each, and a copy is rare (no pool burst per click).
    const sections: Partial<Record<RecordsCopySection, unknown[]>> = {};
    for (const s of included) sections[s] = await read[s]();
    await this.audit.record("export", "Copy of records", patientId);
    return RecordsCopy.parse({
      kind: "primolar.records-copy",
      version: 1,
      generatedAt: this.clock.now().toISOString(),
      clinic: { id: who.clinicId, name: await this.clinic.name() },
      requestedBy: { name: who.user.name, role: who.user.role },
      patient,
      ...sections,
      omitted,
    });
  }
}
