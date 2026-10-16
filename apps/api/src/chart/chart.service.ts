import { Injectable } from "@nestjs/common";
import type { ChartEntry, CreateChartBatchInput, CreateChartEntryInput, Visit } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { lockPatientIfExists } from "../patients/patient-lock";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { CHART_COLUMNS, CHART_ORDER, toChartEntry } from "./chart.rows";
import { batchRefusal, entryRefusal } from "./chart.rules";

type Finding = Omit<CreateChartEntryInput, "tooth" | "supersedes">;

/**
 * features/chart/mocks.ts. Append-only (CHUNKS B5): this service creates and reads ChartEntry rows and nothing else;
 * the tenant extension refuses any update or delete (APPEND_ONLY). The chart itself is deriveChart() in the web.
 */
@Injectable()
export class ChartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly visits: VisitsService,
    private readonly clock: Clock,
  ) {}

  /** GET /patients/:id/chart: every entry, oldest first. [] for an unknown patient, as the mock. Audited (decision 6). */
  async entries(patientId: string): Promise<ChartEntry[]> {
    const rows = await this.history(this.prisma, patientId);
    await this.audit.record("view", "Dental chart", patientId);
    return rows;
  }

  /** POST /patients/:id/chart: one finding, or a correction when `supersedes` is set. The body was parsed (400) first. */
  async record(patientId: string, input: CreateChartEntryInput): Promise<ChartEntry> {
    return runInTransaction(this.prisma, async (tx) => {
      const visit = await this.lockedVisit(tx, input.visitId, patientId);
      refuse(entryRefusal(input, visit, await this.history(tx, patientId)));
      const [entry] = await this.write(tx, patientId, visit!, input, [input.tooth], input.supersedes);
      await this.audit.record("update", "Dental chart", patientId, tx);
      return entry!;
    });
  }

  /** POST /patients/:id/chart/batch: one finding on 2–32 teeth, one entry each, all or none (chart/mocks.ts). */
  async recordBatch(patientId: string, input: CreateChartBatchInput): Promise<ChartEntry[]> {
    return runInTransaction(this.prisma, async (tx) => {
      const visit = await this.lockedVisit(tx, input.visitId, patientId);
      refuse(batchRefusal(input, visit, await this.history(tx, patientId)));
      const { teeth, ...finding } = input;
      const entries = await this.write(tx, patientId, visit!, finding, teeth);
      await this.audit.record("update", "Dental chart", patientId, tx); // one entry per request, as the mock's gate
      return entries;
    });
  }

  /** This patient's entries, oldest first. Indexed by (clinicId, patientId, recordedAt). */
  private async history(db: Tx, patientId: string): Promise<ChartEntry[]> {
    const rows = await db.chartEntry.findMany({ where: { patientId }, select: CHART_COLUMNS, orderBy: [...CHART_ORDER] });
    return rows.map(toChartEntry);
  }

  /**
   * The visit, read after the patient's lock so its status and the history can't change underneath (decision 5). An
   * unknown patient isn't a 404 of its own: its visit is missing, the mock's "Visit not found for this patient".
   */
  private async lockedVisit(tx: Tx, visitId: string, patientId: string): Promise<Visit | undefined> {
    await lockPatientIfExists(tx, patientId);
    return this.visits.forPatient(tx, visitId, patientId);
  }

  /** One row per tooth, in the order given. ≤ 32 inserts in one transaction: MySQL has no createManyAndReturn. */
  private async write(tx: Tx, patientId: string, visit: Visit, finding: Finding, teeth: number[], supersedes?: string): Promise<ChartEntry[]> {
    const recordedAt = this.clock.now();
    const out: ChartEntry[] = [];
    for (const tooth of teeth) {
      const row = await tx.chartEntry.create({
        data: {
          ...clinicData(), patientId, visitId: visit.id, tooth, surfaces: finding.surfaces, condition: finding.condition,
          note: finding.note ?? null, recordedBy: visit.dentistId, recordedAt, supersedes: supersedes ?? null,
        },
        select: CHART_COLUMNS,
      });
      out.push(toChartEntry(row));
    }
    return out;
  }
}
