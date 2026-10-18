import { Injectable } from "@nestjs/common";
import { DEFAULT_BRAND_COLOR, type Signup } from "@pedia/shared";
import { NOTE_TEMPLATES, PROCEDURES, defaultMessageTemplates, firstNotice } from "@pedia/seed";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { IdentityService } from "../auth/identity.service";
import { Clock } from "../common/clock";
import type { Tx } from "../prisma/transaction";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";

/** A new clinic's ids, made before anything is locked. UUIDs: a storage key segment and an id column take them. */
export type ClinicIds = { clinicId: string; branchId: string; staffId: string; chairId: string };
export const newClinicIds = (): ClinicIds => ({ clinicId: randomUUID(), branchId: randomUUID(), staffId: randomUUID(), chairId: randomUUID() });

/** The Owner's one-time secrets and their hashes (IdentityService.newStaffSecrets), made before the transaction. */
export type OwnerSecrets = { temporaryPassword: string; pin: string; passwordHash: string; pinHash: string };

/**
 * Billing #15, the mock's `createClinic`: the clinic as its sign-up describes it, in the caller's transaction, which
 * holds the platform lock and the sign-up's. Every tenant row is written in the new clinic's request context
 * (`requestContext.within({ clinicId })` around the transaction), so the tenant extension stamps them. The order:
 * the account first, the sign-up's approval last.
 */
@Injectable()
export class ClinicFactory {
  constructor(
    private readonly identity: IdentityService,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async write(tx: Tx, signup: Signup, ids: ClinicIds, secrets: OwnerSecrets): Promise<void> {
    const { clinicId, branchId, staffId, chairId } = ids;
    const { account, branch, owner, branding, agreement } = signup;
    const now = this.clock.now();
    // Use my own: the colour and the font (the logo is copied after commit). The default look and Design it for me:
    // Primolar's colour, no logo (#7, #17).
    await tx.clinicAccount.create({
      data: {
        id: clinicId, name: account.name, logoRef: null, contactEmail: account.contactEmail, tin: account.tin, tier: account.tier, status: "active",
        brandColor: branding.choice === "own" ? branding.brandColor : DEFAULT_BRAND_COLOR,
        headingFont: branding.choice === "own" ? branding.headingFont : null,
      },
      select: { id: true },
    });
    // Privacy #7, #8: the sign-up's acceptance, carried to the clinic.
    await tx.agreement.create({
      data: {
        clinicId, termsVersion: agreement.termsVersion, dpaVersion: agreement.dpaVersion, acceptedBy: agreement.acceptedBy, at: new Date(agreement.at),
        method: agreement.method, signedOn: agreement.signedOn ? new Date(`${agreement.signedOn}T00:00:00.000Z`) : null,
      },
      select: { id: true },
    });
    await tx.branch.create({
      data: { id: branchId, clinicId, name: branch.name, address: branch.address, phone: branch.phone, openingHours: branch.openingHours, archived: false, position: 0 },
      select: { id: true },
    });
    await tx.staff.create({
      data: { id: staffId, clinicId, fullName: owner.fullName, role: owner.role, alsoRoles: [], isOwner: true, branchIds: [branchId], licenseNo: null, email: owner.email, position: 0 },
      select: { id: true },
    });
    await this.identity.createStaffLogin(tx, { clinicId, staffId, email: owner.email, name: owner.fullName, passwordHash: secrets.passwordHash, pinHash: secrets.pinHash });
    // As chunk 21 did: one chair, the standard price list and templates.
    await tx.chair.create({ data: { id: chairId, clinicId, branchId, name: "Chair 1", position: 0 }, select: { id: true } });
    await tx.procedure.createMany({
      data: PROCEDURES.map(({ code, name, defaultDurationMin, fee, perTooth }, position) => ({ clinicId, code, name, defaultDurationMin, fee, perTooth, position })),
    });
    await tx.noteTemplate.createMany({ data: NOTE_TEMPLATES.map(({ id, name, procedure, fields }, position) => ({ clinicId, id, name, procedure, fields, position })) });
    await tx.messageTemplate.createMany({
      data: defaultMessageTemplates(clinicId, now.toISOString()).map(({ kind, name, body }, position) => ({ clinicId, kind, name, body, updatedAt: now, position })),
    });
    // Privacy #19: the notice from Primolar's template, its contact the Owner.
    const notice = firstNotice(clinicId, account.name, owner.fullName, account.contactEmail);
    await tx.privacyNotice.create({ data: { ...notice, at: now }, select: { id: true } });
    // Privacy #23: the acceptance is the clinic's first audited event, dated when it was given.
    await this.audit.recordFor(tx, { id: staffId, name: agreement.acceptedBy, role: owner.role }, "create", "Terms and DPA (accepted)", new Date(agreement.at));
    // Billing #26: due monthly from today; the upfront payment is its first invoice.
    await this.subscriptions.start(tx, { clinicId, tier: account.tier, quote: signup.quote, payment: signup.payment! });
    await tx.signup.update({
      where: { id: signup.id },
      data: { status: "approved", clinicId, approvedAt: now, ...(branding.choice === "designed" && { designStatus: "in_progress" }) },
      select: { id: true },
    });
  }
}
