import { Injectable } from "@nestjs/common";
import { lastVisitOn } from "@pedia/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The day each patient was last seen, for the patient list and the header (B4 decision 3, filled in B5). Completed visits
 * only until B7 adds done appointments (decision 2). One query per page, whatever its size (no N+1).
 */
@Injectable()
export class VisitDaysService {
  constructor(private readonly prisma: PrismaService) {}

  async lastVisitOn(patientIds: readonly string[]): Promise<Map<string, string>> {
    if (!patientIds.length) return new Map();
    const rows = await this.prisma.visit.findMany({
      where: { patientId: { in: [...patientIds] }, status: "completed" },
      select: { patientId: true, status: true, date: true },
    });
    const visits = rows.map((r) => ({ patientId: r.patientId, status: r.status, date: r.date.toISOString().slice(0, 10) }));
    return new Map(patientIds.flatMap((id) => {
      const day = lastVisitOn(id, visits, []);
      return day ? [[id, day] as const] : [];
    }));
  }
}
