import { Injectable } from "@nestjs/common";
import { addMonths, format, parseISO } from "date-fns";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";

/** What one clinic uses against its plan (B12 decisions 10, 17, 18). */
export type ClinicCounts = { branches: number; staffLogins: number; patients: number; storageBytes: number; textParts: number };

/** A Manila month's bounds as UTC text for raw SQL (the B8 trap: a Date is written as UTC text). */
export function monthBounds(month: string): { from: string; to: string } {
  const utc = (day: string) => new Date(`${day}T00:00:00+08:00`).toISOString().slice(0, 19).replace("T", " ");
  return { from: utc(`${month}-01`), to: utc(format(addMonths(parseISO(`${month}-01`), 1), "yyyy-MM-dd")) };
}

type Row = { clinicId: string; n: bigint | string | number | null };

/**
 * Counts for the operator's list and a clinic's own usage (B12 Step 6.1). Raw `GROUP BY clinicId`, one query per
 * measure: the console reads every clinic at once and the tenant extension refuses a model query with no clinic. Each
 * query names `clinicId` itself (the raw-SQL trap); every aggregate goes through `Number` (bigint and DECIMAL).
 */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async forClinics(clinicIds: readonly string[], month: string, db: Tx | PrismaService = this.prisma): Promise<Map<string, ClinicCounts>> {
    const result = new Map<string, ClinicCounts>(clinicIds.map((id) => [id, { branches: 0, staffLogins: 0, patients: 0, storageBytes: 0, textParts: 0 }]));
    if (clinicIds.length === 0) return result;
    const ids = Prisma.join([...clinicIds]);
    const { from, to } = monthBounds(month);
    const measures: [keyof ClinicCounts, Promise<Row[]>][] = [
      ["branches", db.$queryRaw<Row[]>`SELECT clinicId, COUNT(*) AS n FROM Branch WHERE clinicId IN (${ids}) AND archived = false GROUP BY clinicId`],
      ["staffLogins", db.$queryRaw<Row[]>`SELECT clinicId, COUNT(*) AS n FROM Staff WHERE clinicId IN (${ids}) AND deactivatedAt IS NULL GROUP BY clinicId`],
      ["patients", db.$queryRaw<Row[]>`SELECT clinicId, COUNT(*) AS n FROM Patient WHERE clinicId IN (${ids}) GROUP BY clinicId`],
      ["storageBytes", db.$queryRaw<Row[]>`SELECT clinicId, SUM(bytes) AS n FROM StoredFile WHERE clinicId IN (${ids}) GROUP BY clinicId`],
      [
        "textParts",
        db.$queryRaw<Row[]>`SELECT clinicId, SUM(segments) AS n FROM Message WHERE clinicId IN (${ids}) AND dispatchedAt >= ${from} AND dispatchedAt < ${to} GROUP BY clinicId`,
      ],
    ];
    for (const [key, query] of measures) {
      for (const row of await query) {
        const counts = result.get(row.clinicId);
        if (counts) counts[key] = Number(row.n ?? 0);
      }
    }
    return result;
  }

  async forClinic(clinicId: string, month: string, db: Tx | PrismaService = this.prisma): Promise<ClinicCounts> {
    return (await this.forClinics([clinicId], month, db)).get(clinicId)!;
  }
}
