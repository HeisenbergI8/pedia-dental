import { Injectable } from "@nestjs/common";
import { ANONYMISED, type RetentionPeriods, retentionConfirmed, retentionEnded } from "@pedia/shared";
import { format } from "date-fns";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { Clock } from "../common/clock";
import { requestContext, requireContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service";
import { lockPatient } from "../patients/patient-lock";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { VisitDaysService } from "../visits/visit-days.service";

export const NOT_RESTRICTED = "Only a restricted record (an approved erasure) is anonymised.";
/** Children anonymised per run at most: each is one short transaction; the rest wait for the next night. */
export const ANONYMISE_PER_RUN = 50;

type Child = { clinicId: string; patientId: string };
type Deps = { deleteFiles: (keys: (string | null)[]) => Promise<void>; appointments: AppointmentRecordsService };
type Treatment = { does: string; run?: (tx: Tx, child: Child, deps: Deps) => Promise<unknown> };

/**
 * B13c2b-2 (D4–D6): what anonymisation does to each model holding a child's record. The keys are exactly the schedule's
 * "clinical record" and "personal data" models (erasure.test.ts); a new one fails check until it is decided here.
 * Raw SQL ONLY on append-only tables (ClinicalPhoto, PatientDocument, PatientPrivacyConsent, PrivacyChoice, ChartEntry):
 * the explicit APPEND_ONLY exception, as OperatorAuditService.prune. Every Prisma update or delete on them is still refused.
 */
export const ANONYMISE: Record<string, Treatment> = {
  Patient: {
    does: "Names → Anonymised and the chart number; nickname, address, emergency contact, profile and history cleared; birth date → 1 January; search columns emptied; photo file deleted",
    run: async (tx, { patientId }, { deleteFiles }) => {
      const p = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { patientNo: true, birthDate: true, photoRef: true } });
      await deleteFiles([p.photoRef]);
      await tx.patient.update({
        where: { id: patientId },
        select: { id: true },
        data: {
          firstName: ANONYMISED, lastName: p.patientNo, nickname: null, address: null, emergencyName: null, emergencyPhone: null,
          birthDate: new Date(`${p.birthDate.toISOString().slice(0, 4)}-01-01T00:00:00.000Z`),
          profile: Prisma.DbNull, dentalHistory: { previousClinic: "", notes: "" },
          searchNames: "", searchPhones: "", photoRef: null, photoUpdatedAt: null,
        },
      });
    },
  },
  PatientGuardian: {
    // The phone becomes the word, not "": the contract's Guardian.phone is required (min 7), and a restricted child is never texted.
    does: "Names and phone → Anonymised; email cleared (this child's rows only: a sibling's guardian rows are their own)",
    run: (tx, { patientId }) => tx.patientGuardian.updateMany({ where: { patientId }, data: { fullName: ANONYMISED, phone: ANONYMISED, email: null } }),
  },
  PatientConsent: { does: "Kept: scope, date and a guardian id, no name" },
  PatientPrivacyConsent: {
    does: "The copied guardian name → Anonymised (raw SQL: append-only)",
    run: (tx, c) => tx.$executeRaw`UPDATE PatientPrivacyConsent SET guardianName = ${ANONYMISED} WHERE clinicId = ${c.clinicId} AND patientId = ${c.patientId}`,
  },
  PrivacyChoice: {
    does: "A parent's name on their choices → Anonymised; staff names kept (raw SQL: append-only)",
    run: (tx, c) => tx.$executeRaw`UPDATE PrivacyChoice SET byName = ${ANONYMISED} WHERE clinicId = ${c.clinicId} AND patientId = ${c.patientId} AND \`by\` = 'parent'`,
  },
  Visit: { does: "Kept: dates, dentist and status" },
  ChartEntry: {
    does: "Free-text note cleared; tooth, surfaces and condition kept (raw SQL: append-only)",
    run: (tx, c) => tx.$executeRaw`UPDATE ChartEntry SET note = NULL WHERE clinicId = ${c.clinicId} AND patientId = ${c.patientId}`,
  },
  ClinicalNote: {
    does: "Template values and behaviour note cleared; template, ratings, author and signature kept",
    run: (tx, { patientId }) => tx.clinicalNote.updateMany({ where: { patientId }, data: { values: {}, behaviorNote: null } }),
  },
  GrowthRecord: { does: "Speech notes cleared; habit ticks kept", run: (tx, { patientId }) => tx.growthRecord.updateMany({ where: { patientId }, data: { speech: null } }) },
  PlanItem: { does: "Kept: procedures, teeth, fees and status" },
  ClinicalPhoto: {
    does: "Files deleted (storage.delete); captions cleared (raw SQL: append-only); type, stage, tooth and date kept",
    run: async (tx, c, { deleteFiles }) => {
      await deleteFiles((await tx.clinicalPhoto.findMany({ where: { patientId: c.patientId }, select: { fileKey: true } })).map((r) => r.fileKey));
      return tx.$executeRaw`UPDATE ClinicalPhoto SET caption = '' WHERE clinicId = ${c.clinicId} AND patientId = ${c.patientId}`;
    },
  },
  PatientDocument: {
    does: "Title → Anonymised; details and items cleared; type, issuer and date kept (raw SQL: append-only)",
    run: (tx, c) => tx.$executeRaw`UPDATE PatientDocument SET title = ${ANONYMISED}, details = NULL, items = NULL WHERE clinicId = ${c.clinicId} AND patientId = ${c.patientId}`,
  },
  Appointment: { does: "Reason → Anonymised; cancel reason cleared; times, chair and status kept", run: (tx, { patientId }, { appointments }) => appointments.anonymiseFor(tx, patientId) },
  AppointmentRequest: {
    does: "Reason → Anonymised; note cleared",
    run: (tx, { patientId }) => tx.appointmentRequest.updateMany({ where: { patientId }, data: { reason: ANONYMISED, note: null } }),
  },
  DueItem: { does: "Kept: procedure and due day" },
  Message: {
    does: "Body and number cleared; recipient → Anonymised; kind, status and times kept",
    run: (tx, { patientId }) => tx.message.updateMany({ where: { patientId }, data: { body: "", to: "", recipientName: ANONYMISED } }),
  },
  PortalAccount: { does: "Kept: a guardian's portal state, shared with siblings (D5, Q4)" },
};

/**
 * B13c2b-2: de-identifies a restricted child's record once its legal retention has ended (privacy.anonymise). The
 * record stays restricted (D8): hidden from lists, search, families, booking and the due list, as B13c2b-1 left it.
 */
@Injectable()
export class ErasureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly outbox: OutboxService,
    private readonly visitDays: VisitDaysService,
    private readonly appointments: AppointmentRecordsService,
  ) {}

  /**
   * One child, in the context's clinic, in one transaction under the patient's lock (Message writes need it, B9 E8).
   * Refuses an unrestricted child; false (and nothing done) when already anonymised. File deletions are outbox rows in
   * the same transaction, so a rerun on deadlock or a rollback leaves no file deleted early.
   */
  async anonymise(patientId: string): Promise<boolean> {
    const clinicId = requireContext().clinicId!;
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const { restrictedAt, anonymisedAt } = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { restrictedAt: true, anonymisedAt: true } });
      if (!restrictedAt) throw new Error(NOT_RESTRICTED);
      if (anonymisedAt) return false;
      const deleteFiles = async (keys: (string | null)[]) => {
        for (const key of new Set(keys.filter((k): k is string => !!k))) await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key } });
      };
      for (const treatment of Object.values(ANONYMISE)) await treatment.run?.(tx, { clinicId, patientId }, { deleteFiles, appointments: this.appointments });
      await tx.patient.update({ where: { id: patientId }, data: { anonymisedAt: this.clock.now() }, select: { id: true } });
      return true;
    });
  }

  /**
   * The job's work: across clinics, restricted and not yet anonymised children whose retention has ended, at most
   * `limit`. Nothing at all while the periods are unconfirmed. Needs a request context (the job's), each clinic run within it.
   */
  async anonymiseDue(periods: RetentionPeriods, limit = ANONYMISE_PER_RUN): Promise<number> {
    if (!retentionConfirmed(periods)) return 0;
    const today = this.clock.today();
    let done = 0;
    for (const { id: clinicId } of await this.prisma.clinicAccount.findMany({ select: { id: true }, orderBy: { id: "asc" } })) {
      if (done >= limit) break;
      done += await requestContext.within({ clinicId }, async () => {
        const restricted = await this.prisma.patient.findMany({
          where: { restrictedAt: { not: null }, anonymisedAt: null }, select: { id: true, birthDate: true, createdAt: true }, orderBy: { id: "asc" },
        });
        const lastVisit = await this.visitDays.lastVisitOn(restricted.map((p) => p.id));
        let n = 0;
        for (const p of restricted) {
          if (done + n >= limit) break;
          const child = { birthDate: p.birthDate.toISOString().slice(0, 10), lastActivityOn: lastVisit.get(p.id) ?? format(p.createdAt, "yyyy-MM-dd") };
          if (retentionEnded(child, periods, today) && (await this.anonymise(p.id))) n++;
        }
        return n;
      });
    }
    return done;
  }
}
