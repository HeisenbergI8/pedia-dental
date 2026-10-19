import { Injectable } from "@nestjs/common";
import type { AcknowledgementPrompt } from "@pedia/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";
import { promptChildren } from "./family";

const GUARDIAN = { guardianId: true, fullName: true, phone: true, email: true } as const;
export type FamilyGuardian = { guardianId: string; fullName: string; phone: string; email: string | null };

/** A parent's family (the mock's childrenOf, logins.ts:51): the children listing their guardian id. Clinic-scoped. */
@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The patient ids listing this guardian. Computed per request, as the mock does: never cached on a session.
   * B13c2b E6: a restricted child isn't the parent's any more, so a parent left with none can't sign in, and an open
   * session ends on its next request (IdentityService.forSession).
   */
  async childrenOf(guardianId: string): Promise<ReadonlySet<string>> {
    const rows = await this.prisma.patientGuardian.findMany({ where: { guardianId }, select: { patientId: true } });
    if (!rows.length) return new Set();
    const open = await this.prisma.patient.findMany({ where: { id: { in: rows.map((r) => r.patientId) }, restrictedAt: null }, select: { id: true } });
    return new Set(open.map((p) => p.id));
  }

  /** One guardian as a child's record has them (B11: the portal invites them). Undefined: not on this child. */
  async guardianOn(tx: Tx, patientId: string, guardianId: string): Promise<FamilyGuardian | undefined> {
    return (await tx.patientGuardian.findFirst({ where: { patientId, guardianId }, select: GUARDIAN })) ?? undefined;
  }

  /** A child's guardians in the record's order, and the child's first name (B11: the Overview's portal status). */
  async familyOf(tx: Tx, patientId: string): Promise<{ firstName: string; guardians: FamilyGuardian[] } | undefined> {
    const child = await tx.patient.findFirst({ where: { id: patientId }, select: { firstName: true } });
    if (!child) return undefined;
    const guardians = await tx.patientGuardian.findMany({ where: { patientId }, select: GUARDIAN, orderBy: { position: "asc" } });
    return { firstName: child.firstName, guardians };
  }

  /**
   * These guardians as their first child's record has them (siblings share the guardian and their phone: PATCH keeps
   * them in step), with that child's id. A guardian on no child is left out (B11 decision 10).
   */
  async guardians(tx: Tx, guardianIds: readonly string[]): Promise<(FamilyGuardian & { firstChildId: string })[]> {
    if (!guardianIds.length) return [];
    const rows = await tx.patientGuardian.findMany({
      where: { guardianId: { in: [...guardianIds] } },
      select: { ...GUARDIAN, patientId: true },
      orderBy: [{ patientId: "asc" }],
    });
    const first = new Map<string, FamilyGuardian & { firstChildId: string }>();
    for (const { patientId, ...g } of rows) if (!first.has(g.guardianId)) first.set(g.guardianId, { ...g, firstChildId: patientId });
    return [...first.values()];
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
