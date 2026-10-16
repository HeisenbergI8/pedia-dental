import { Injectable } from "@nestjs/common";
import { lastVisitOn, type Appointment, type Visit } from "@pedia/shared";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { PrismaService } from "../prisma/prisma.service";

export type VisitFacts = { visits: Pick<Visit, "patientId" | "status" | "date">[]; done: Appointment[] };

/**
 * The days patients were seen: completed visits and done appointments (visitDays, B5 decision 2, filled in B7). One
 * query each per call, whatever the page size (no N+1). `branchIds` narrows the appointments only, as the mock's
 * branchView (dashboard/mocks.ts:20–25): visits are account-wide.
 */
@Injectable()
export class VisitDaysService {
  constructor(private readonly prisma: PrismaService, private readonly appointments: AppointmentRecordsService) {}

  async facts(patientIds: readonly string[], branchIds?: readonly string[]): Promise<VisitFacts> {
    if (!patientIds.length) return { visits: [], done: [] };
    const [rows, done] = await Promise.all([
      this.prisma.visit.findMany({ where: { patientId: { in: [...patientIds] }, status: "completed" }, select: { patientId: true, status: true, date: true } }),
      this.appointments.forPatients(patientIds, { status: "done", ...(branchIds && { branchId: { in: [...branchIds] } }) }),
    ]);
    return { visits: rows.map((r) => ({ patientId: r.patientId, status: r.status, date: r.date.toISOString().slice(0, 10) })), done };
  }

  async lastVisitOn(patientIds: readonly string[]): Promise<Map<string, string>> {
    const byPatient = groupBy(await this.facts(patientIds));
    return new Map(patientIds.flatMap((id) => {
      const mine = byPatient.get(id);
      const day = mine && lastVisitOn(id, mine.visits, mine.done);
      return day ? [[id, day] as const] : [];
    }));
  }
}

/** Per-patient slices, so the shared per-patient filters stay linear over a page (not patients × rows). */
export function groupBy({ visits, done }: VisitFacts): Map<string, VisitFacts> {
  const out = new Map<string, VisitFacts>();
  const slot = (id: string) => out.get(id) ?? out.set(id, { visits: [], done: [] }).get(id)!;
  for (const v of visits) slot(v.patientId).visits.push(v);
  for (const a of done) slot(a.patientId).done.push(a);
  return out;
}
