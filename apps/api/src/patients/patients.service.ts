import { Injectable, NotFoundException } from "@nestjs/common";
import {
  PatientHeaderSummary, PatientPage, findDuplicates, permissionScopeFor, rolesCan, searchWords,
  type DuplicateMatch, type Patient, type PatientListQuery, type PatientView,
} from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import { DueItemsService } from "../recalls/due-items.service";
import { StorageService, type StoredFile } from "../storage/storage.service";
import type { Tx } from "../prisma/transaction";
import { VisitDaysService } from "../visits/visit-days.service";
import { PATIENT_NOT_FOUND } from "./patient-lock";
import { photoFileName } from "./patient-photo";
import { standingPage, type Named } from "./patient-standing";
import { scopeCondition, searchCondition } from "./patient-search";
import { inScope, toDuplicate, toPatient, toSummary, visibleTo, type Viewer } from "./patient.views";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The patient reads (features/patients/mocks.ts). Every response passes through visibleTo or toSummary. */
@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly visitDays: VisitDaysService,
    private readonly dueItems: DueItemsService,
    private readonly clock: Clock,
  ) {}

  /** Full records for these ids, in this order. Five queries whatever the count (no N+1). Missing ids are skipped. */
  async records(ids: readonly string[], tx: Tx = this.prisma): Promise<Patient[]> {
    if (!ids.length) return [];
    const where = { patientId: { in: [...ids] } };
    const [rows, guardians, consents, privacy, choices] = await Promise.all([
      tx.patient.findMany({ where: { id: { in: [...ids] } } }),
      tx.patientGuardian.findMany({ where }),
      tx.patientConsent.findMany({ where }),
      tx.patientPrivacyConsent.findMany({ where }),
      tx.privacyChoice.findMany({ where }),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const mine = <T extends { patientId: string }>(xs: T[]) => xs.filter((x) => x.patientId === id);
      return [toPatient({ row, guardians: mine(guardians), consents: mine(consents), privacyConsent: mine(privacy)[0], choices: mine(choices) })];
    });
  }

  /** One record or 404, with the mock's words. */
  async one(id: string, tx: Tx = this.prisma): Promise<Patient> {
    const [p] = await this.records([id], tx);
    if (!p) throw new NotFoundException(PATIENT_NOT_FOUND);
    return p;
  }

  /** Who a request is from when staff ask on a family's behalf: the primary guardian, else the first (mock's `find(isPrimary) ?? guardians[0]`). */
  async primaryGuardianId(tx: Tx, patientId: string): Promise<string> {
    const g = await tx.patientGuardian.findFirst({ where: { patientId }, select: { guardianId: true }, orderBy: [{ isPrimary: "desc" }, { position: "asc" }] });
    return g!.guardianId; // every patient has a guardian (CreatePatientInput)
  }

  /** GET /patients: the directory (⌘K, pickers). Unpaged, as the mock (see Follow Ups). Not audited (decision 4). */
  async directory(viewer: Viewer, q: string): Promise<PatientView[]> {
    const ids = await this.matching(viewer, q);
    return (await this.records(ids)).map((p) => visibleTo(viewer, p));
  }

  /** GET /patient-summaries: search (SQL), then the mock's standing, filters, counts, sort and page (E7). */
  async summaries(viewer: Viewer, query: PatientListQuery): Promise<PatientPage> {
    const matched = await this.names(await this.matching(viewer, query.q)); // every match: the counts need them all
    const ids = matched.map((p) => p.id);
    const [facts, due] = await Promise.all([this.visitDays.facts(ids), this.dueItems.openFor(ids)]);
    const money = rolesCan(viewer.roles, "billing.view");
    const { rows, total, page, counts } = standingPage(matched, facts, due, query, this.clock.today(), money);
    const patients = await this.records(rows.map((r) => r.id)); // the page's records, in the page's order
    const siblings = await this.siblingsOf(viewer, patients);
    const standing = new Map(rows.map((r) => [r.id, r]));
    return PatientPage.parse({
      rows: patients.map((p) => toSummary(viewer, p, (siblings.get(p.id) ?? []).map((s) => s.firstName), money, standing.get(p.id)!)),
      total, page, pageSize: query.pageSize, counts,
    });
  }

  /** GET /patients/:id: one audit entry per record view (decision 4), only once it is found. */
  async view(viewer: Viewer, id: string): Promise<PatientView> {
    const p = await this.one(id);
    await this.audit.record("view", "Patient profile", id);
    return visibleTo(viewer, p);
  }

  /** GET /patients/:id/summary: the pinned header. Money is zero until B8; the last visit counts done appointments (B7). */
  async headerSummary(viewer: Viewer, id: string): Promise<PatientHeaderSummary> {
    const p = await this.one(id);
    await this.audit.record("view", "Patient profile", id);
    const money = inScope(viewer, "billing.view", id);
    const lastVisitOn = (await this.visitDays.lastVisitOn([id])).get(id);
    return PatientHeaderSummary.parse({
      patientId: p.id, patientNo: p.patientNo,
      ...(lastVisitOn && { lastVisitOn }),
      ...(money && { balance: 0, credit: 0 }),
      siblings: (await this.siblingsOf(viewer, [p])).get(p.id) ?? [],
    });
  }

  /** GET /patient-duplicates: same birth date by index, then findDuplicates' name rule. A warning, never a block. */
  async duplicates(candidate: { firstName: string; lastName: string; birthDate: string }): Promise<DuplicateMatch[]> {
    if (!ISO_DAY.test(candidate.birthDate)) return [];
    const rows = await this.prisma.patient.findMany({
      where: { birthDate: new Date(`${candidate.birthDate}T00:00:00.000Z`) },
      select: { id: true, patientNo: true, firstName: true, lastName: true, birthDate: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const shaped = rows.map((r) => ({ ...r, birthDate: r.birthDate.toISOString().slice(0, 10) }));
    return findDuplicates(candidate, shaped).map((r) => toDuplicate(r as Patient));
  }

  /** GET /patients/:id/photo. One audit entry per view (decision 4), only when there is a photo to see. */
  async photo(id: string): Promise<{ file: StoredFile; name: string } | undefined> {
    const row = await this.prisma.patient.findUnique({ where: { id }, select: { photoRef: true, firstName: true, lastName: true } });
    const file = row?.photoRef ? await this.storage.get(row.photoRef) : undefined;
    if (!row || !file) return undefined;
    await this.audit.record("view", "Patient photo", id);
    return { file, name: photoFileName(row) };
  }

  /**
   * Children sharing a guardian phone with each of `patients` (the mock's siblingsOf), limited to those this viewer
   * may see. Two queries for the whole page. Phones never leave this method.
   */
  async siblingsOf(viewer: Viewer, patients: Patient[]): Promise<Map<string, { id: string; firstName: string }[]>> {
    const phones = [...new Set(patients.flatMap((p) => p.guardians.map((g) => g.phone)))];
    if (!phones.length) return new Map();
    const links = await this.prisma.patientGuardian.findMany({ where: { phone: { in: phones } }, select: { patientId: true, phone: true } });
    const kin = await this.prisma.patient.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.patientId))] } },
      select: { id: true, firstName: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return new Map(
      patients.map((p) => {
        const mine = new Set(p.guardians.map((g) => g.phone));
        const ids = new Set(links.filter((l) => mine.has(l.phone) && l.patientId !== p.id).map((l) => l.patientId));
        return [p.id, kin.filter((k) => ids.has(k.id) && inScope(viewer, "patients.view", k.id))];
      }),
    );
  }

  /** The ids matching a search, in the list's order. `clinicId` is written here: the tenant extension can't see raw SQL. */
  private async matching(viewer: Viewer, q: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Patient WHERE ${this.where(viewer, q)} ORDER BY lastName, firstName, id`;
    return rows.map((r) => r.id);
  }

  /** What the list sorts by, in `ids`' order. */
  private async names(ids: readonly string[]): Promise<Named[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.patient.findMany({ where: { id: { in: [...ids] } }, select: { id: true, firstName: true, lastName: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  private where(viewer: Viewer, q: string): Prisma.Sql {
    const clinicId = requireContext().clinicId!; // behind the guard on every clinic route
    const own = permissionScopeFor(viewer.roles, "patients.view") === "all" ? undefined : viewer.children;
    const phones = rolesCan(viewer.roles, "patients.contact"); // the mock's phone rule (mocks.ts:106)
    return Prisma.sql`clinicId = ${clinicId} AND ${scopeCondition(own)} AND ${searchCondition(searchWords(q), phones)}`;
  }
}
