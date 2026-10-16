import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AddStaffInput, type AddStaffResult, type StaffMember } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { IdentityService } from "../auth/identity.service";
import { SessionService } from "../auth/session.service";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { type Tx, runInTransaction } from "../prisma/transaction";
import { lockAccount, ownClinicId } from "./account-lock";
import { toStaffMember } from "./clinic.views";
import { assertRoomFor } from "./limits";

const STAFF = {
  id: true, clinicId: true, fullName: true, role: true, alsoRoles: true, isOwner: true, branchIds: true, licenseNo: true, email: true, deactivatedAt: true,
} as const;

/**
 * The Owner's staff logins (features/clinic/mocks.ts, decisions #21, #23, #27). Deactivated, never deleted: names stay
 * on what they recorded. Adds and reactivations take the clinic's lock (B3, Decision 4), so the seat count and the
 * one-email rule hold under concurrent requests. Each change writes the mock's audit entry in its transaction.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** POST /staff: the login, with its temporary password and PIN returned this once and stored only as hashes. */
  async add(body: unknown): Promise<AddStaffResult> {
    // Hashed before the transaction: argon2 is slow on purpose, and the clinic's lock would be held meanwhile.
    const secrets = await this.identity.newStaffSecrets();
    const viewer = requireContext().user!.roles;
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      await assertRoomFor(tx, clinicId, "staffLogins");
      const { email, alsoRoles, licenseNo, ...input } = new ZodValidationPipe(AddStaffInput).transform(body);
      if (await this.emailInUse(tx, clinicId, email)) throw new ConflictException(`${email} already signs in to ${await this.clinicName(tx, clinicId)}`);
      const open = await tx.branch.findMany({ where: { id: { in: input.branchIds }, archived: false }, select: { id: true } });
      if (open.length !== new Set(input.branchIds).size) throw new BadRequestException("Choose branches that are open");
      const last = await tx.staff.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
      const row = await tx.staff.create({
        data: {
          ...clinicData(), fullName: input.fullName, role: input.role, alsoRoles: alsoRoles?.filter((r) => r !== input.role) ?? [], isOwner: false,
          branchIds: input.branchIds, licenseNo: licenseNo || null, email, position: (last?.position ?? -1) + 1,
        },
        select: STAFF,
      });
      await this.identity.createStaffLogin(tx, { clinicId, staffId: row.id, email, name: row.fullName, passwordHash: secrets.passwordHash, pinHash: secrets.pinHash });
      await this.audit.record("create", "Staff login", undefined, tx);
      return { staff: toStaffMember(row, viewer), temporaryPassword: secrets.temporaryPassword, pin: secrets.pin };
    });
  }

  /**
   * POST /staff/:id/deactivate: no sign-in from now on, name kept, a seat freed (decision #23). Never the Owner (#13:
   * only the operator transfers ownership), never yourself. Their sessions end after commit; the guard already refuses
   * a deactivated login on its next request (IdentityService.forSession), so this is tidying, not the safeguard.
   */
  async deactivate(id: string): Promise<StaffMember> {
    const { user } = requireContext();
    const staff = await runInTransaction(this.prisma, async (tx) => {
      const row = await this.find(tx, id);
      if (row.isOwner) throw new BadRequestException("The Owner's login can't be deactivated. Contact Primolar to transfer ownership first.");
      if (row.id === user!.id) throw new BadRequestException("You can't deactivate your own login");
      if (row.deactivatedAt) return row;
      const deactivatedAt = this.clock.now();
      await tx.staff.updateMany({ where: { id }, data: { deactivatedAt } });
      await this.audit.record("update", "Staff login (deactivated)", undefined, tx);
      return { ...row, deactivatedAt };
    });
    await this.sessions.closeAllFor(ownClinicId(), id);
    return toStaffMember(staff, user!.roles);
  }

  /** POST /staff/:id/reactivate: takes a seat again, so the limit applies; and its email must still be its own. */
  reactivate(id: string): Promise<StaffMember> {
    const viewer = requireContext().user!.roles;
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      const row = await this.find(tx, id);
      if (!row.deactivatedAt) return toStaffMember(row, viewer);
      if (await this.emailInUse(tx, clinicId, row.email, row.id)) {
        throw new ConflictException(`${row.email} is now another login's email. Reactivating would give two logins one email.`);
      }
      await assertRoomFor(tx, clinicId, "staffLogins");
      await tx.staff.updateMany({ where: { id }, data: { deactivatedAt: null } });
      await this.audit.record("update", "Staff login (reactivated)", undefined, tx);
      return toStaffMember({ ...row, deactivatedAt: null }, viewer);
    });
  }

  /** This clinic's staff member, or 404 in the mock's words. Another clinic's id reads as missing. */
  private async find(tx: Tx, id: string) {
    const row = await tx.staff.findFirst({ where: { id }, select: STAFF });
    if (!row) throw new NotFoundException("Staff member not found");
    return row;
  }

  /** The mock's emailTaken: any staff login, deactivated ones too, or a parent of this clinic, has it. */
  private async emailInUse(tx: Tx, clinicId: string, email: string, exceptStaffId?: string): Promise<boolean> {
    const staff = await tx.staff.findFirst({ where: { email, ...(exceptStaffId ? { NOT: { id: exceptStaffId } } : {}) }, select: { id: true } });
    return !!staff || (await this.identity.parentHasEmail(tx, clinicId, email));
  }

  private async clinicName(tx: Tx, clinicId: string): Promise<string> {
    return (await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } })).name;
  }
}
