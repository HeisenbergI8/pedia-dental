import { Injectable } from "@nestjs/common";
import {
  Branch as BranchSchema, CONFIDENTIALITY_NOTICE, StaffRole, pinLockout, rolesCan, rolesOf, termsOutdated, usableBranches,
  type AcknowledgementKind, type OperatorUser, type Role,
} from "@pedia/shared";
import { z } from "zod";
import { Clock } from "../common/clock";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { Hasher, pinAttempt, type PinAttempt } from "./hashing";

/** Who a live clinic session is, right now. What the guard puts in the request context and checks. */
export type ClinicIdentity = {
  clinicId: string;
  user: { id: string; name: string; role: Role; roles: Role[] };
  email: string;
  staffId?: string;
  guardianId?: string;
  /** A suspended clinic's parent: reads only (decision #44). Staff of a suspended clinic get no identity at all. */
  readOnly: boolean;
  mustChangePassword: boolean;
  mustAcknowledge?: AcknowledgementKind;
  /** The branches this login may work at (usableBranches): the Owner every open one, staff their assignments. */
  branches: BranchSchema[];
};

const Tries = z.array(z.string());

/** Owns Credential: who a session is, PIN tries, and (B2c) password checks. Every Credential query names clinicId. */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  /**
   * The identity behind a session, or undefined when the login can't work any more: removed, a deactivated staff
   * member (#23), or staff of a suspended account (#41). The caller has put `clinicId` in the request context first,
   * so the clinic-scoped reads here are scoped to it.
   */
  async forSession({ clinicId, accountId }: { clinicId: string; accountId: string }): Promise<ClinicIdentity | undefined> {
    const [account, cred] = await Promise.all([
      this.prisma.clinicAccount.findUnique({ where: { id: clinicId }, select: { status: true } }),
      this.prisma.credential.findUnique({
        where: { clinicId_accountId: { clinicId, accountId } },
        select: { email: true, staffId: true, guardianId: true, name: true, mustChange: true },
      }),
    ]);
    if (!account || !cred) return undefined;
    const suspended = account.status !== "active";

    const staff = cred.staffId ? await this.prisma.staff.findUnique({ where: { id: cred.staffId } }) : null;
    if (cred.staffId && (!staff || staff.deactivatedAt || suspended)) return undefined;
    const roles = staff ? rolesOf({ role: staff.role, alsoRoles: StaffRole.array().parse(staff.alsoRoles), isOwner: staff.isOwner }) : (["parent"] as Role[]);

    const rows = await this.prisma.branch.findMany({ orderBy: { id: "asc" } });
    const all = rows.map((b) => BranchSchema.parse(b));
    const assigned = staff ? z.array(z.string()).parse(staff.branchIds) : undefined;

    return {
      clinicId,
      user: { id: accountId, name: staff?.fullName ?? cred.name, role: roles[0]!, roles },
      email: cred.email,
      staffId: cred.staffId ?? undefined,
      guardianId: cred.guardianId ?? undefined,
      readOnly: suspended,
      mustChangePassword: cred.mustChange,
      mustAcknowledge: await this.pendingAcknowledgement(clinicId, accountId, roles, !!staff, !!cred.guardianId),
      branches: usableBranches(roles, assigned, all),
    };
  }

  /** Port of `pendingAcknowledgement` (apps/web/src/mocks/privacy.ts), P10's order: terms, confidentiality, notice. */
  private async pendingAcknowledgement(clinicId: string, accountId: string, roles: Role[], isStaff: boolean, isGuardian: boolean): Promise<AcknowledgementKind | undefined> {
    if (rolesCan(roles, "clinic.manage")) {
      const latest = await this.prisma.agreement.findFirst({ where: { clinicId }, orderBy: [{ at: "desc" }, { id: "desc" }] });
      const record = latest && { termsVersion: latest.termsVersion, dpaVersion: latest.dpaVersion, acceptedBy: latest.acceptedBy, at: latest.at.toISOString(), method: latest.method };
      if (termsOutdated(record ?? undefined)) return "terms";
    }
    const seen = (kind: "confidentiality" | "notice", version: number) =>
      this.prisma.acknowledgement.findFirst({ where: { accountId, kind, version }, select: { id: true } });
    if (isStaff && !(await seen("confidentiality", CONFIDENTIALITY_NOTICE.version))) return "confidentiality";
    if (isGuardian) {
      const notice = await this.prisma.privacyNotice.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
      if (notice && !(await seen("notice", notice.version))) return "notice";
    }
    return undefined;
  }

  /** The branch this device works at: the pd_branch cookie when the login may use it, else their first. Never trusted. */
  branchFor(identity: ClinicIdentity, cookie: string | undefined): BranchSchema | undefined {
    return identity.branches.find((b) => b.id === cookie) ?? identity.branches[0];
  }

  async operator(operatorId: string): Promise<OperatorUser | undefined> {
    return (await this.prisma.operatorUser.findUnique({ where: { id: operatorId }, select: { id: true, name: true, email: true } })) ?? undefined;
  }

  /**
   * One PIN try for a staff login (B2c's switch). The row is locked while its tries are read and written, so two
   * parallel guesses both count. A locked PIN is refused before its hash is checked. Undefined: no PIN on file.
   */
  async checkPin(clinicId: string, accountId: string, pin: string): Promise<PinAttempt | undefined> {
    return runInTransaction(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM Credential WHERE clinicId = ${clinicId} AND accountId = ${accountId} FOR UPDATE`;
      const row = await tx.credential.findUnique({ where: { clinicId_accountId: { clinicId, accountId } }, select: { id: true, pinHash: true, pinFailedAt: true } });
      if (!row?.pinHash) return undefined;
      const now = this.clock.now();
      const failedAt = Tries.parse(row.pinFailedAt);
      const correct = !pinLockout(failedAt, now).locked && (await this.hasher.matches(row.pinHash, pin));
      const result = pinAttempt(failedAt, correct, now);
      if (result.outcome !== "locked") await tx.credential.updateMany({ where: { id: row.id }, data: { pinFailedAt: result.failedAt } });
      return result;
    });
  }
}
