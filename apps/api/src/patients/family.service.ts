import { Injectable } from "@nestjs/common";
import type { AcknowledgementPrompt } from "@pedia/shared";
import { PrismaService } from "../prisma/prisma.service";
import { promptChildren } from "./family";

/** A parent's family (the mock's childrenOf, logins.ts:51): the children listing their guardian id. Clinic-scoped. */
@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  /** The patient ids listing this guardian. Computed per request, as the mock does: never cached on a session. */
  async childrenOf(guardianId: string): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.patientGuardian.findMany({ where: { guardianId }, select: { patientId: true } });
    return new Set(rows.map((r) => r.patientId));
  }

  /** A parent's children as their notice page lists them (privacy #20): first name, consent on record, choices in force. */
  async promptChildren(guardianId: string): Promise<NonNullable<AcknowledgementPrompt["children"]>> {
    const ids = [...(await this.childrenOf(guardianId))];
    if (!ids.length) return [];
    const [children, consents, choices] = await Promise.all([
      this.prisma.patient.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      this.prisma.patientPrivacyConsent.findMany({ where: { patientId: { in: ids } }, select: { patientId: true } }),
      this.prisma.privacyChoice.findMany({ where: { patientId: { in: ids } }, orderBy: { position: "asc" } }),
    ]);
    const byChild = new Map<string, { photos: boolean; reminders: boolean; by: "staff" | "parent"; byName: string; at: string }[]>();
    for (const c of choices) byChild.set(c.patientId, [...(byChild.get(c.patientId) ?? []), { photos: c.photos, reminders: c.reminders, by: c.by, byName: c.byName, at: c.at.toISOString() }]);
    return promptChildren(children, new Set(consents.map((c) => c.patientId)), byChild);
  }
}
