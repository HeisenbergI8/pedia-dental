import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AddConsentInput, ChangePrivacyChoicesInput, CreatePatientInput, EditPatientWithoutContactsInput, QuickUpdatePatientInput,
  RecordPrivacyConsentInput, currentChoices, nextPatientNo, patientSearchText, type PatientView, type RegisterPatientInput,
} from "@pedia/shared";
import type { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { lockAccount } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrivacyNoticeService } from "../legal/privacy-notice.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { PATIENT_NOT_FOUND, PatientsService } from "./patients.service";
import { consentFrom, dropsConsenter, guardianRows, mergeEdit, patientColumns, refusedTag, tidy, withStoredContacts } from "./patient.rows";
import { inScope, visibleTo, type Viewer } from "./patient.views";

/** A body parsed after the route's own checks (404 before 400, the mock's order). */
const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => new ZodValidationPipe(schema).transform(body);

/** Locks one patient's row for this transaction, or 404s with the mock's words. Raw SQL names clinicId itself. */
export async function lockPatient(tx: Tx, id: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Patient WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException(PATIENT_NOT_FOUND);
}

/** The patient writes (features/patients/mocks.ts). Each runs in one transaction with its audit entry. */
@Injectable()
export class PatientWritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly notices: PrivacyNoticeService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** POST /patients (privacy #12): the child, their guardians and the parent's consent, or nothing. */
  async register(viewer: Viewer, input: RegisterPatientInput): Promise<PatientView> {
    const refused = refusedTag(input.tags);
    if (refused) throw new BadRequestException(refused);
    const { privacyConsent: consent, ...details } = input;
    const at = this.clock.now();
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx); // the number is read and written under the clinic's lock
      const [last] = await tx.$queryRaw<{ n: string | null }[]>`SELECT MAX(patientNo) AS n FROM Patient WHERE clinicId = ${clinicId}`;
      const patientNo = nextPatientNo(last?.n ? [{ patientNo: last.n }] : []);
      const { id } = await tx.patient.create({
        data: { ...clinicData(), ...patientColumns({ ...tidy(details), patientNo, createdAt: at.toISOString() }) },
        select: { id: true },
      });
      await tx.patientGuardian.createMany({ data: guardianRows(id, details.guardians).map((g) => ({ ...clinicData(), ...g })) });
      // RegisterPatientInput already checked the consenter is one of these guardians.
      const recorded = consentFrom(details, consent, { id: viewer.staffId ?? viewer.userId, name: viewer.name }, await this.notices.currentVersion(tx), at.toISOString())!;
      await tx.patientPrivacyConsent.create({ data: { ...clinicData(), patientId: id, ...recorded.privacyConsent, at }, select: { patientId: true } });
      await tx.privacyChoice.create({ data: { ...clinicData(), patientId: id, position: 0, ...recorded.choice, at }, select: { id: true } });
      await this.audit.record("create", "Patient profile", id, tx);
      await this.audit.record("create", "Privacy consent", id, tx); // #23, beside the profile entry (mocks.ts:180)
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /** PUT /patients/:id: the whole record but consents. Without patients.contact the stored contacts are kept. */
  async update(viewer: Viewer, id: string, body: unknown): Promise<PatientView> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, id);
      const current = await this.patients.one(id, tx);
      let input: CreatePatientInput;
      if (inScope(viewer, "patients.contact", id)) input = parse(CreatePatientInput, body);
      else {
        const kept = withStoredContacts(current, parse(EditPatientWithoutContactsInput, body));
        if (!kept) throw new ForbiddenException("Only front desk and admin can add a guardian");
        input = kept;
      }
      const refused = refusedTag(input.tags);
      if (refused) throw new BadRequestException(refused);
      if (dropsConsenter(current, input)) throw new ConflictException("A guardian who signed a consent can't be removed");
      const next = mergeEdit(current, input);
      const { id: _id, patientNo: _no, createdAt: _at, ...columns } = patientColumns(next);
      await tx.patient.update({ where: { id }, data: columns, select: { id: true } });
      await tx.patientGuardian.deleteMany({ where: { patientId: id } });
      await tx.patientGuardian.createMany({ data: guardianRows(id, next.guardians).map((g) => ({ ...clinicData(), ...g })) });
      await this.audit.record("update", "Patient profile", id, tx);
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /** PATCH /patients/:id: phone, nickname, tags and alerts. The phone is the primary guardian's, on every child of theirs. */
  async quickUpdate(viewer: Viewer, id: string, body: unknown): Promise<PatientView> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, id);
      const input = parse(QuickUpdatePatientInput, body);
      const refused = refusedTag(input.tags);
      if (refused) throw new BadRequestException(refused);
      const current = await this.patients.one(id, tx);
      let touched = [id];
      if (input.phone !== undefined) {
        if (!inScope(viewer, "patients.contact", id)) throw new ForbiddenException("Only front desk and admin can change contact details");
        const primary = current.guardians.find((g) => g.isPrimary) ?? current.guardians[0]!;
        // One guardian, one phone: siblings share the guardian id, so they all get the new number (mocks.ts:289).
        await tx.patientGuardian.updateMany({ where: { guardianId: primary.id }, data: { phone: input.phone } });
        const kin = await tx.patientGuardian.findMany({ where: { guardianId: primary.id }, select: { patientId: true } });
        touched = [...new Set([id, ...kin.map((k) => k.patientId)])];
      }
      await tx.patient.update({ where: { id }, data: { nickname: input.nickname || null, tags: input.tags, alerts: input.alerts }, select: { id: true } });
      await this.refreshSearch(tx, touched);
      await this.audit.record("update", "Patient profile", id, tx);
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /** POST /patients/:id/consents: a treatment consent by one of this child's guardians. Never edited. */
  async addConsent(viewer: Viewer, id: string, body: unknown): Promise<PatientView> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, id);
      const input = parse(AddConsentInput, body);
      const current = await this.patients.one(id, tx);
      if (!current.guardians.some((g) => g.id === input.guardianId)) throw new BadRequestException("Guardian does not belong to this patient");
      await tx.patientConsent.create({
        data: { ...clinicData(), patientId: id, guardianId: input.guardianId, scope: input.scope, date: new Date(`${input.date}T00:00:00.000Z`), createdAt: this.clock.now() },
        select: { id: true },
      });
      await this.audit.record("create", "Consent", id, tx);
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /** POST /patients/:id/privacy-consent (#18): a child registered before chunk 24. Recorded once. */
  async recordConsent(viewer: Viewer, id: string, body: unknown): Promise<PatientView> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, id);
      const current = await this.patients.one(id, tx);
      if (current.privacyConsent) throw new ConflictException("Consent is already recorded for this child. Change the optional consents instead.");
      const input = parse(RecordPrivacyConsentInput, body);
      const at = this.clock.now();
      const recorded = consentFrom(current, input, { id: viewer.staffId ?? viewer.userId, name: viewer.name }, await this.notices.currentVersion(tx), at.toISOString());
      if (!recorded) throw new BadRequestException("Choose one of this child's guardians");
      await tx.patientPrivacyConsent.create({ data: { ...clinicData(), patientId: id, ...recorded.privacyConsent, at }, select: { patientId: true } });
      await tx.privacyChoice.create({ data: { ...clinicData(), patientId: id, position: current.privacyChoices?.length ?? 0, ...recorded.choice, at }, select: { id: true } });
      await this.audit.record("create", "Privacy consent", id, tx);
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /**
   * POST /patients/:id/privacy-choices (#15): staff, or the parent for their own child, switch photos or reminders.
   * Only what changed is sent; it is merged onto the choices on record, and the result is a new row.
   */
  async changeChoices(viewer: Viewer, id: string, body: unknown): Promise<PatientView> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, id);
      const current = await this.patients.one(id, tx);
      if (!current.privacyConsent) throw new ConflictException("Record the parent's consent first");
      const input = parse(ChangePrivacyChoicesInput, body);
      const was = currentChoices(current);
      await tx.privacyChoice.create({
        data: {
          ...clinicData(), patientId: id, position: current.privacyChoices?.length ?? 0,
          photos: input.photos ?? was?.photos ?? false, reminders: input.reminders ?? was?.reminders ?? false,
          by: viewer.guardianId ? "parent" : "staff", byName: viewer.name, at: this.clock.now(),
        },
        select: { id: true },
      });
      // #14: a "no" to reminders also withdraws queued messages (mocks.ts:267). Messages arrive with B9, which adds
      // that withdrawal here, in this transaction. Until then there is nothing queued on the API to withdraw.
      await this.audit.record("update", "Privacy consent (changed)", id, tx);
      return visibleTo(viewer, await this.patients.one(id, tx));
    });
  }

  /** Rewrites the search columns (decision 1) of these patients from their stored record. A handful of rows. */
  private async refreshSearch(tx: Tx, ids: string[]): Promise<void> {
    for (const p of await this.patients.records(ids, tx)) {
      const { names, digits } = patientSearchText(p);
      await tx.patient.update({ where: { id: p.id }, data: { searchNames: names, searchPhones: digits }, select: { id: true } });
    }
  }
}
