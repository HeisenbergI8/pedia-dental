import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  OwnerCandidate, SetBrandingInput, StaffRole, brandColorProblem, isActiveStaff, rolesOf, suggestBrandColor, transferProblem,
  type AccountOverview, type AccountStatus,
} from "@pedia/shared";
import type { Request } from "express";
import { z } from "zod";
import { lockAccount } from "../clinic/account-lock";
import { isDemoLogo } from "../clinic/logo";
import { requestContext } from "../common/request-context";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { readSignupForm } from "../signups/signup-form";
import { SignupsService } from "../signups/signups.service";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { StorageService } from "../storage/storage.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";
import { AccountOverviewService } from "./account-overview";

export const ACCOUNT_NOT_FOUND = "Clinic account not found";
const NOT_DESIGNED = "Primolar sets the look only for clinics that chose Design it for me. Other clinics' Owners set theirs in Settings.";

/**
 * The console's writes to one clinic account (features/operator/mocks.ts): its status, ownership and delivered look.
 * Clinic rows are read and written in that clinic's request context (`within`), so the tenant extension scopes them;
 * the operator never holds a clinic session. Operator actions are logged by id (the audit trail holds clinic users).
 */
@Injectable()
export class OperatorAccountsService {
  private readonly log = new Logger(OperatorAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly overviews: AccountOverviewService,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly signups: SignupsService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

  /** The account's id, matched against ClinicAccount only; 404 otherwise. */
  async exists(id: string): Promise<string> {
    const row = id.length <= 191 ? await this.prisma.clinicAccount.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!row) throw new NotFoundException(ACCOUNT_NOT_FOUND);
    return row.id;
  }

  async overview(id: string): Promise<AccountOverview> {
    return (await this.overviews.of([id]))[0]!;
  }

  private done(action: string, clinicId: string) {
    this.log.log({ operatorId: requestContext.current()?.operatorId, clinicId }, action);
  }

  /**
   * Decisions #26, #41, #44: a paused clinic's staff are refused at sign-in and on their next request (the identity reads
   * the status every time); parents read on. Reactivating is refused while the subscription would pause it again (S3).
   */
  async setStatus(id: string, status: AccountStatus): Promise<AccountOverview> {
    const clinicId = await this.exists(id);
    await runInTransaction(this.prisma, async (tx) => {
      await this.subscriptions.lockAccount(tx, clinicId);
      await this.subscriptions.lock(tx, clinicId);
      if (status === "active") {
        const refused = await this.subscriptions.reactivateRefusal(tx, clinicId);
        if (refused) throw new ConflictException(refused);
        await this.subscriptions.forgetPause(tx, clinicId);
      }
      await tx.clinicAccount.update({ where: { id: clinicId }, data: { status }, select: { id: true } });
    });
    this.done(status === "active" ? "Account reactivated" : "Account paused", clinicId);
    return this.overview(clinicId);
  }

  /** Decision #13: who ownership may go to: the account's active staff logins, the Owner left out, by name. */
  async ownerCandidates(id: string): Promise<OwnerCandidate[]> {
    const clinicId = await this.exists(id);
    const staff = await requestContext.within({ clinicId }, () =>
      this.prisma.staff.findMany({ select: { id: true, fullName: true, email: true, role: true, alsoRoles: true, isOwner: true, deactivatedAt: true } }),
    );
    return staff
      .filter((s) => !s.isOwner && isActiveStaff({ deactivatedAt: s.deactivatedAt?.toISOString() }))
      .map((s) => OwnerCandidate.parse({ staffId: s.id, name: s.fullName, email: s.email ?? "", roles: rolesOf({ role: s.role, alsoRoles: StaffRole.array().parse(s.alsoRoles) }) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Decision #13: only the operator moves ownership, only to an active staff login of the same account. The old Owner
   * keeps their role and branches, unless none of those is open any more (#62): then every open one. Live sessions pick
   * up the new roles on their next request (IdentityService rebuilds them from Staff each time).
   */
  async transferOwnership(id: string, staffId: string): Promise<AccountOverview> {
    const clinicId = await this.exists(id);
    await requestContext.within({ clinicId }, () =>
      runInTransaction(this.prisma, async (tx) => {
        await lockAccount(tx);
        const staff = await tx.staff.findMany({ select: { id: true, fullName: true, isOwner: true, deactivatedAt: true, branchIds: true } });
        const problem = transferProblem(staff.map((s) => ({ ...s, deactivatedAt: s.deactivatedAt?.toISOString() })), staffId);
        if (problem) throw new BadRequestException(problem);
        const from = staff.find((s) => s.isOwner);
        if (from) {
          const open = (await tx.branch.findMany({ where: { archived: false }, select: { id: true } })).map((b) => b.id);
          const kept = z.array(z.string()).parse(from.branchIds);
          await tx.staff.updateMany({ where: { id: from.id }, data: { isOwner: false, ...(!kept.some((b) => open.includes(b)) && { branchIds: open }) } });
        }
        await tx.staff.updateMany({ where: { id: staffId }, data: { isOwner: true } });
      }),
    );
    this.done("Ownership transferred", clinicId);
    return this.overview(clinicId);
  }

  /**
   * Billing #17–#20, A9: the finished design for a Design it for me clinic, the operator's only branding power. One
   * colour that passes AA, a font from the shortlist, and the logo (needed until one has been delivered). The logo is
   * the clinic's own file (counted toward its storage), stored before the transaction; the old one deleted after commit.
   */
  async setBranding(id: string, req: Request): Promise<AccountOverview> {
    const clinicId = await this.exists(id);
    const design = await this.signups.designOf(clinicId);
    if (!design) throw new ConflictException(NOT_DESIGNED);
    const form = await readSignupForm(req, SetBrandingInput);
    try {
      const { brandColor, headingFont } = form.data;
      const problem = brandColorProblem(brandColor);
      if (problem) throw new BadRequestException(`${problem} Try ${suggestBrandColor(brandColor)}.`);
      const account = await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { logoRef: true } });
      if (!form.logo && !(design === "delivered" && account.logoRef)) throw new BadRequestException("Add the finished logo");
      await requestContext.within({ clinicId }, async () => {
        const key = form.logo && (await this.storage.put("branding", form.logo.ext, form.logo.body));
        const write = () =>
          runInTransaction(this.prisma, async (tx) => {
            await this.signups.markDesignDelivered(tx, clinicId); // E6: the sign-up's row before the account's
            await lockAccount(tx);
            const { logoRef: old } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { logoRef: true } });
            await tx.clinicAccount.update({ where: { id: clinicId }, data: { brandColor, headingFont, ...(key && { logoRef: key }) }, select: { id: true } });
            if (key && old && !isDemoLogo(old)) await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key: old } });
          });
        await (key ? this.storage.keepIf(key, write) : write());
      });
    } finally {
      await form.dispose();
    }
    this.done("Branding delivered", clinicId);
    return this.overview(clinicId);
  }
}
