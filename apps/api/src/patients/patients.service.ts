import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import {
  PATIENT_SEARCH_LIMIT, PatientFilter, PatientHeaderSummary, PatientPage, accountCredit, listBounds, pageWindow, standingOn, accountSummary, findDuplicates, permissionScopeFor, rolesCan, searchWords,
  type DuplicateMatch, type Patient, type PatientListQuery, type PatientView,
} from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { PatientRestrictions } from "../auth/patient-restrictions";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { StorageService } from "../storage/storage.service";
import type { Tx } from "../prisma/transaction";
import { VisitDaysService } from "../visits/visit-days.service";
import { PATIENT_NOT_FOUND } from "./patient-lock";
import { photoFileName } from "./patient-photo";
import { countsSql, filterSql, orderSql } from "./patient-standing";
import { scopeCondition, searchCondition } from "./patient-search";
import { inScope, toDuplicate, toPatient, toSummary, visibleTo, type Viewer } from "./patient.views";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined); // a @db.Date: UTC midnight

/** The patient reads (features/patients/mocks.ts). Every response passes through visibleTo or toSummary. */
@Injectable()
export class PatientsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly visitDays: VisitDaysService,
    private readonly clock: Clock,
    private readonly billing: BillingRecordsService,
    private readonly restrictions: PatientRestrictions,
  ) {}

  /** B13c2b E6: the guard's list of restricted children (PatientRestrictions). One indexed read, ids only. */
  onModuleInit() {
    this.restrictions.register(async () => {
      const rows = await this.prisma.patient.findMany({ where: { restrictedAt: { not: null } }, select: { id: true } });
      return new Set(rows.map((r) => r.id));
    });
  }

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

  /** B13c2a: children's names for one page of the audit log, in one query. A deleted id is simply absent. */
  async namesOf(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.patient.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } });
    return new Map(rows.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  }

  /**
   * B14: these ids plus every child born on `today`'s month and day (isBirthdayOn: exact MM-DD, so no 29 February rule).
   * Today's `patients` and the birthday job's children; never the whole table (5,000 rows were Today's cost).
   * E6: no restricted child. Raw SQL names the clinic.
   */
  async basicsFor(ids: readonly string[], today: string): Promise<{ id: string; firstName: string; lastName: string; birthDate: string }[]> {
    const named = ids.length ? Prisma.sql`id IN (${Prisma.join([...ids])}) OR ` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string; firstName: string; lastName: string; birthDate: Date }[]>`
      SELECT id, firstName, lastName, birthDate FROM Patient
      WHERE clinicId = ${requireContext().clinicId!} AND restrictedAt IS NULL
        AND (${named}(MONTH(birthDate) = ${Number(today.slice(5, 7))} AND DAY(birthDate) = ${Number(today.slice(8, 10))}))
      ORDER BY id`;
    return rows.map((r) => ({ ...r, birthDate: r.birthDate.toISOString().slice(0, 10) }));
  }

  /** Whether this clinic has the patient (the billing routes' 404 before the body, as the mock). */
  async exists(id: string): Promise<boolean> {
    return (await this.prisma.patient.count({ where: { id } })) > 0;
  }

  /** GET /patients: the directory (⌘K, pickers). An empty `q` is unpaged, as the mock (B14 Q2); a search answers PATIENT_SEARCH_LIMIT. Not audited (decision 4). */
  async directory(viewer: Viewer, q: string): Promise<PatientView[]> {
    const ids = await this.matching(viewer, q, searchWords(q).length ? PATIENT_SEARCH_LIMIT : undefined); // B14: a search is capped
    return (await this.records(ids)).map((p) => visibleTo(viewer, p));
  }

  /** GET /patient-summaries: search (SQL), then the mock's standing, filters, counts, sort and page (E7). */
  async summaries(viewer: Viewer, query: PatientListQuery): Promise<PatientPage> {
    // B14: counts, filter, sort and page in SQL over the stored standing (D2): two queries whatever the clinic's size.
    const today = this.clock.today();
    const bounds = listBounds(today);
    const money = rolesCan(viewer.roles, "billing.view");
    const where = this.where(viewer, query.q);
    const [c] = await this.prisma.$queryRaw<Record<PatientFilter, unknown>[]>`SELECT ${countsSql(bounds)} FROM Patient WHERE ${where}`;
    const counts = Object.fromEntries(PatientFilter.options.map((f) => [f, Number(c![f])])) as Record<PatientFilter, number>;
    const total = counts[query.filter];
    const { page, offset } = pageWindow(total, query.page, query.pageSize);
    const sort = query.sort === "balance" && !money ? "name" : query.sort; // the mock's leak guard (mocks.ts:144)
    const stored = await this.prisma.$queryRaw<{ id: string; lastVisitOn: Date | null; nextDueOn: Date | null; balance: number; noContact: unknown }[]>`
      SELECT id, lastVisitOn, nextDueOn, balance, noContact FROM Patient WHERE ${where} AND ${filterSql(query.filter, bounds)}
      ORDER BY ${orderSql(sort)} LIMIT ${query.pageSize} OFFSET ${offset}`;
    const rows = stored.map((r) => ({
      id: r.id,
      ...standingOn({ lastVisitOn: day(r.lastVisitOn), nextDueOn: day(r.nextDueOn), balance: Number(r.balance), noContact: Number(r.noContact) === 1 }, today),
    }));
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

  /** GET /patients/:id/summary: the pinned header. Balance and credit are the shared rules over live bills (B8 E8). */
  async headerSummary(viewer: Viewer, id: string): Promise<PatientHeaderSummary> {
    const p = await this.one(id);
    await this.audit.record("view", "Patient profile", id);
    const money = inScope(viewer, "billing.view", id);
    const [lastVisits, bills] = await Promise.all([this.visitDays.lastVisitOn([id]), money ? this.billing.billTotals([id]) : undefined]);
    const lastVisitOn = lastVisits.get(id);
    return PatientHeaderSummary.parse({
      patientId: p.id, patientNo: p.patientNo,
      ...(lastVisitOn && { lastVisitOn }),
      ...(bills && { balance: accountSummary(bills.invoices, bills.payments).balance, credit: accountCredit(bills.invoices, bills.payments) }),
      siblings: (await this.siblingsOf(viewer, [p])).get(p.id) ?? [],
    });
  }

  /** GET /patient-duplicates: same birth date by index, then findDuplicates' name rule. A warning, never a block. */
  async duplicates(candidate: { firstName: string; lastName: string; birthDate: string }): Promise<DuplicateMatch[]> {
    if (!ISO_DAY.test(candidate.birthDate)) return [];
    const rows = await this.prisma.patient.findMany({
      where: { birthDate: new Date(`${candidate.birthDate}T00:00:00.000Z`), restrictedAt: null }, // B13c2b E6
      select: { id: true, patientNo: true, firstName: true, lastName: true, birthDate: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const shaped = rows.map((r) => ({ ...r, birthDate: r.birthDate.toISOString().slice(0, 10) }));
    return findDuplicates(candidate, shaped).map((r) => toDuplicate(r as Patient));
  }

  /** GET /patients/:id/photo: a 5-minute private link (B10 E2). One audit entry per view (decision 4), only when there is a photo. */
  async photoLink(id: string): Promise<string | undefined> {
    const row = await this.prisma.patient.findUnique({ where: { id }, select: { photoRef: true, firstName: true, lastName: true } });
    const link = row?.photoRef ? await this.storage.link(row.photoRef, { fileName: photoFileName(row) }) : undefined;
    if (!link) return undefined;
    await this.audit.record("view", "Patient photo", id);
    return link;
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
      where: { id: { in: [...new Set(links.map((l) => l.patientId))] }, restrictedAt: null }, // B13c2b E6: no sibling chip
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
  private async matching(viewer: Viewer, q: string, limit?: number): Promise<string[]> {
    const cap = limit === undefined ? Prisma.empty : Prisma.sql` LIMIT ${limit}`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Patient WHERE ${this.where(viewer, q)} ORDER BY lastName, firstName, id${cap}`;
    return rows.map((r) => r.id);
  }

  private where(viewer: Viewer, q: string): Prisma.Sql {
    const clinicId = requireContext().clinicId!; // behind the guard on every clinic route
    const own = permissionScopeFor(viewer.roles, "patients.view") === "all" ? undefined : viewer.children;
    const phones = rolesCan(viewer.roles, "patients.contact"); // the mock's phone rule (mocks.ts:106)
    // B13c2b E6: a restricted child leaves the list, the directory and search for everyone.
    return Prisma.sql`clinicId = ${clinicId} AND restrictedAt IS NULL AND ${scopeCondition(own)} AND ${searchCondition(searchWords(q), phones)}`;
  }
}
