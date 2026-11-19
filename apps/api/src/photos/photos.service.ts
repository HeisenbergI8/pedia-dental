import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleInit, PayloadTooLargeException } from "@nestjs/common";
import { CONSENTED_PHOTO_TYPES, STAFF_PHOTO_KEPT, UPLOAD_RULES, UploadPhotoInput, beforeBirthProblem, choiceDeclined, manilaMonth, parentUploadRefusal, photoFileName, rolesCan, type ClinicalPhoto, type Patient, type PhotoType } from "@pedia/shared";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import { Clock } from "../common/clock";
import { ID_MAX } from "../common/ids";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { OutboxService } from "../outbox/outbox.service";
import { lockPatient } from "../patients/patient-lock";
import type { Viewer } from "../patients/patient.views";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { ownClinicId } from "../clinic/account-lock";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { readUpload, tooLargeToRead } from "../storage/multipart";
import { CONTENT_TYPES } from "../storage/storage";
import { StorageService } from "../storage/storage.service";
import { VisitsService } from "../visits/visits.service";
import { photoFileProblem } from "./photo-file";
import { PHOTO_SELECT, photoData, toPhoto } from "./photo.rows";

/** What a parent may upload from the portal (photos/mocks.ts:10). Clinical imaging (X-rays) is the clinic's. */
const PARENT_TYPES: readonly PhotoType[] = ["intraoral", "extraoral", "document"];
const declined = (patient: Patient, type: PhotoType) => CONSENTED_PHOTO_TYPES.includes(type) && choiceDeclined(patient, "photos");
const declinedWords = (p: Patient) =>
  `${p.firstName}'s family declined clinical photos. Staff can change this under Privacy on the child's Overview; parents on the portal's Home page.`;

/**
 * Clinical photos and parents' medical documents (features/photos/mocks.ts). The only reader and writer of ClinicalPhoto.
 * Uploads are spooled, checked in the mock's order, then stored (E1); the row is written under the patient's lock with
 * consent read again (E6). Opening a file is a 5-minute link (E2). Never updated or deleted (decision 5), but for a
 * parent's upload, which staff may remove (audit #5, `remove`).
 */
@Injectable()
export class PhotosService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly owners: RecordOwners,
    private readonly clock: Clock,
  ) {}

  onModuleInit() {
    this.owners.register("/photos/:id/file", (id) => this.patientOf(id)); // a parent's own-scope check (E12)
    this.owners.register("/photos/:id", (id) => this.patientOf(id)); // audit #5: a restricted child stays refused to non-privacy staff
  }

  async patientOf(id: string): Promise<string | undefined> {
    return (await this.prisma.clinicalPhoto.findFirst({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** GET /patients/:id/photos: newest first; without clinical.view (a parent), only what parents uploaded. */
  async list(viewer: Viewer, patientId: string): Promise<ClinicalPhoto[]> {
    if (patientId.length > ID_MAX) return []; // no such child, as an unknown id (tester D3)
    const clinical = rolesCan(viewer.roles, "clinical.view");
    const rows = await this.prisma.clinicalPhoto.findMany({
      where: { patientId, ...(!clinical && { uploadedBy: "parent" as const }) },
      orderBy: [{ takenOn: "desc" }, { createdAt: "desc" }],
      select: PHOTO_SELECT,
    });
    await this.audit.record("view", "Photos", patientId);
    return rows.map(toPhoto);
  }

  /** POST /patients/:id/photos: multipart `file` + `meta`. Every refusal in the mock's order (photos/mocks.ts:26–73). */
  async upload(viewer: Viewer, patientId: string, req: Request): Promise<ClinicalPhoto> {
    if (!(await this.patients.exists(patientId))) throw new NotFoundException("Patient not found");
    if (tooLargeToRead(req.headers, UPLOAD_RULES.maxBytes)) throw new PayloadTooLargeException("Files must be under 10 MB"); // E13
    const upload = await readUpload(req, { maxBytes: UPLOAD_RULES.maxBytes });
    try {
      const { file } = upload;
      if (!file) throw new BadRequestException("Attach a file");
      let meta: unknown;
      try {
        meta = JSON.parse(upload.fields.get("meta") ?? "null"); // the mock's String(null): a missing meta fails the schema
      } catch {
        throw new BadRequestException("`meta` must be JSON");
      }
      const parsed = UploadPhotoInput.safeParse(meta);
      if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
      const input = parsed.data;
      const checked = photoFileProblem(input.type, file);
      if ("problem" in checked) throw checked.status === 413 ? new PayloadTooLargeException(checked.problem) : new BadRequestException(checked.problem);
      const patient = await this.patients.one(patientId);
      if (declined(patient, input.type)) throw new ConflictException(declinedWords(patient));
      const fromParent = !rolesCan(viewer.roles, "clinical.write");
      if (fromParent && (!PARENT_TYPES.includes(input.type) || input.visitId || input.stage || input.tooth)) {
        throw new BadRequestException("Upload a photo or a medical document");
      }
      if (input.visitId && (await this.visits.patientOf(input.visitId)) !== patientId) throw new BadRequestException("Visit not found");
      const beforeBirth = beforeBirthProblem(input.takenOn, patient.birthDate); // issue 13
      if (beforeBirth) throw new BadRequestException(beforeBirth);
      // Audit #5: a parent's uploads have their own limits per child, checked before storing (and again under the lock).
      const overParentLimit = async (db: Pick<Tx, "clinicalPhoto" | "auditEvent">) => fromParent && parentUploadRefusal(patient.firstName, await this.parentUse(db, patientId), file.bytes);
      const early = await overParentLimit(this.prisma);
      if (early) throw new ConflictException(early);

      // Stored before the transaction (slow work first; runInTransaction may rerun its callback).
      const key = await this.storage.putFile("photos", checked.ext, file);
      const saved = await this.storage.keepIf(key, () => runInTransaction(this.prisma, async (tx) => {
        await lockPatient(tx, patientId); // before any read (CONVENTIONS → Traps); privacy choices hold the same lock
        if (declined(await this.patients.one(patientId, tx), input.type)) {
          await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key } }); // E6: a "no" landed in between
          return undefined;
        }
        const late = await overParentLimit(tx); // parallel uploads for one child: exact under the patient's lock
        if (late) throw new ConflictException(late); // keepIf removes the stored file
        const row = await tx.clinicalPhoto.create({
          data: {
            ...clinicData(),
            ...photoData(input),
            patientId,
            contentType: CONTENT_TYPES[checked.ext],
            uploadedBy: fromParent ? "parent" : "staff",
            fileKey: key,
            bytes: file.bytes,
            createdAt: this.clock.now(),
          },
          select: PHOTO_SELECT,
        });
        await this.audit.record("create", "Photo", patientId, tx);
        return toPhoto(row);
      }));
      if (!saved) throw new ConflictException(declinedWords(patient));
      return saved;
    } finally {
      await upload.dispose();
    }
  }

  /**
   * Audit #5: the files a parent sent for this child this Manila month, and the bytes of every parent upload still
   * stored. "Sent" is counted from the trail's uploads by a parent (BotF-8), so a file staff remove doesn't give the
   * month's slot back ("You've sent 20 files"); the bytes come back, as the storage limit is about what is kept.
   */
  private async parentUse(db: Pick<Tx, "clinicalPhoto" | "auditEvent">, patientId: string): Promise<{ thisMonth: number; storedBytes: number }> {
    const monthStart = new Date(`${manilaMonth(this.clock.today())}-01T00:00:00+08:00`);
    const [thisMonth, stored] = await Promise.all([
      db.auditEvent.count({ where: { patientId, action: "create", record: "Photo", actorRole: "parent", at: { gte: monthStart } } }),
      db.clinicalPhoto.aggregate({ where: { patientId, uploadedBy: "parent" }, _sum: { bytes: true } }),
    ]);
    return { thisMonth, storedBytes: stored._sum.bytes ?? 0 };
  }

  /**
   * DELETE /photos/:id (audit #5; clinical.write: the Owner, admins and dentists): removes a photo or document a parent
   * sent from the portal, so a parent can't fill the clinic's storage for good. Staff photos stay append-only (decision
   * 5: part of the medical record), so the row goes by raw SQL that names `uploadedBy = 'parent'` (a recorded exception
   * to APPEND_ONLY, like the three in CONVENTIONS → Traps); the file and its ledger row go after the commit
   * (storage.delete). Audited.
   */
  async remove(id: string): Promise<Record<string, never>> {
    const patientId = id.length <= ID_MAX ? await this.patientOf(id) : undefined;
    if (!patientId) throw new NotFoundException("Photo not found");
    await runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // before any read (CONVENTIONS → Traps); a photo's child never changes
      const row = await tx.clinicalPhoto.findFirst({ where: { id }, select: { uploadedBy: true, fileKey: true } });
      if (!row) throw new NotFoundException("Photo not found"); // removed by someone else meanwhile
      if (row.uploadedBy !== "parent") throw new ConflictException(STAFF_PHOTO_KEPT);
      const gone = await tx.$executeRaw`DELETE FROM ClinicalPhoto WHERE id = ${id} AND clinicId = ${ownClinicId()} AND uploadedBy = 'parent'`;
      if (gone !== 1) throw new NotFoundException("Photo not found");
      await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key: row.fileKey } });
      await this.audit.record("update", "Photo (removed a parent's upload)", patientId, tx);
    });
    return {};
  }

  /** GET /photos/:id/file: a 5-minute link, or undefined (404) for an unknown photo or a parent on clinical imaging. */
  async fileLink(viewer: Viewer, id: string, download: boolean): Promise<string | undefined> {
    const row = await this.prisma.clinicalPhoto.findFirst({
      where: { id },
      select: { patientId: true, type: true, tooth: true, takenOn: true, contentType: true, uploadedBy: true, fileKey: true },
    });
    if (!row || (row.uploadedBy !== "parent" && !rolesCan(viewer.roles, "clinical.view"))) return undefined;
    const patient = await this.patients.one(row.patientId);
    const photo = { type: row.type, tooth: row.tooth ?? undefined, takenOn: row.takenOn.toISOString().slice(0, 10), contentType: row.contentType };
    const link = await this.storage.link(row.fileKey, { fileName: photoFileName(patient, photo), download });
    if (!link) return undefined;
    await this.audit.record("view", "Photo", row.patientId);
    return link;
  }
}
