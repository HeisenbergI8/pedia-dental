import { Injectable } from "@nestjs/common";
import { DOCUMENT_SOURCE, GenerateDocumentInput, NOTE_MESSAGES, isMoneyIn, type PatientDocument } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { NotesService } from "../notes/notes.service";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { DOCUMENT_SELECT, documentData, toDocument } from "./document.rows";
import { documentRefusal, documentTitle } from "./documents.rules";

const NEWEST_FIRST = [{ createdAt: "desc" as const }, { id: "desc" as const }];

/**
 * The issued-documents log (features/documents/mocks.ts; decision 6). The only reader and writer of PatientDocument.
 * The server checks run on the log request, before any PDF exists: the browser builds the PDF only after a 201, so a
 * refused document never produces a file. Append-only (E7).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly notes: NotesService,
    private readonly billing: BillingRecordsService,
    private readonly clinic: ClinicService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** GET /documents: every document issued across the clinic, newest first, at most 100 (the mock). Not audited (E10). */
  async log(): Promise<PatientDocument[]> {
    return (await this.prisma.patientDocument.findMany({ orderBy: NEWEST_FIRST, take: 100, select: DOCUMENT_SELECT })).map(toDocument);
  }

  /** GET /patients/:id/documents, newest first. [] for an unknown child, as the mock. Audited "Documents". */
  async forPatient(patientId: string): Promise<PatientDocument[]> {
    const rows = await this.prisma.patientDocument.findMany({ where: { patientId }, orderBy: NEWEST_FIRST, select: DOCUMENT_SELECT });
    await this.audit.record("view", "Documents", patientId);
    return rows.map(toDocument);
  }

  /** POST /patients/:id/documents: 404 → 400 issues → the mock's refusals (documentRefusal) → 201. */
  async issue(patientId: string, body: unknown): Promise<PatientDocument> {
    const patient = await this.patients.one(patientId); // 404 "Patient not found" before the body is looked at
    const parsed = GenerateDocumentInput.safeParse(body);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
    const input = parsed.data;
    const [issuer, sourceFits] = await Promise.all([this.clinic.staffRoles(input.issuedBy), this.sourceFits(input, patientId)]);
    refuse(documentRefusal(input, { issuer, sourceFits, patient }));
    return runInTransaction(this.prisma, async (tx) => {
      const row = await tx.patientDocument.create({
        data: { ...clinicData(), ...documentData(input), patientId, title: documentTitle(input, patient), createdAt: this.clock.now() },
        select: DOCUMENT_SELECT,
      });
      await this.audit.record("export", "Document", patientId, tx);
      return toDocument(row);
    });
  }

  /** The mock's sourceFits: the right kind of record, this child's, in a state a document can come from. */
  private async sourceFits(d: GenerateDocumentInput, patientId: string): Promise<boolean> {
    if (!d.sourceId) return !DOCUMENT_SOURCE[d.type];
    switch (DOCUMENT_SOURCE[d.type]?.kind) {
      case "visit": {
        const visit = await this.visits.one(this.prisma, d.sourceId);
        return visit?.patientId === patientId && visit.status === "completed";
      }
      case "payment": // a transfer of credit has no receipt (isMoneyIn)
        return (await this.billing.paymentsOf(patientId)).some((p) => p.id === d.sourceId && isMoneyIn(p));
      case "note": {
        const procedure = await this.notes.signedProcedure(d.sourceId, patientId);
        return !!procedure && !!NOTE_MESSAGES[procedure]; // a procedure with care instructions
      }
      default:
        return true; // a type with no source keeps sourceId as given, unchecked (the mock)
    }
  }
}
