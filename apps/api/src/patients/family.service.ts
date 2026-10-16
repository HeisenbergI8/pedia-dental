import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** A parent's family (the mock's childrenOf, logins.ts:51): the children listing their guardian id. Clinic-scoped. */
@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  /** The patient ids listing this guardian. Computed per request, as the mock does: never cached on a session. */
  async childrenOf(guardianId: string): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.patientGuardian.findMany({ where: { guardianId }, select: { patientId: true } });
    return new Set(rows.map((r) => r.patientId));
  }
}
