import { Injectable } from "@nestjs/common";
import {
  Branch as BranchSchema, CONFIDENTIALITY_NOTICE, LEGAL_DOCUMENTS, Role as RoleSchema, StaffRole, pinLockout, rolesCan, rolesOf, termsOutdated, usableBranches,
  type AcknowledgementKind, type AcknowledgementPrompt, type OperatorUser, type Role, type SessionUser,
} from "@pedia/shared";
import { DEMO_CLINIC_ID } from "@pedia/seed";
import { z } from "zod";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import type { Tx } from "../prisma/transaction";
import { runInTransaction } from "../prisma/transaction";
import { Hasher, pinAttempt, type PinAttempt } from "./hashing";
import { newPin, temporaryPassword } from "./secrets";
import { FamilyService } from "../patients/family.service";

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
  /** A parent's children, by patient id (decision 5): what own-scope rules and the services check. Staff: absent. */
  children?: ReadonlySet<string>;
};

const Tries = z.array(z.string());

/** Who the audit trail names for a login (AuditService reads it from the request context). */
export type Actor = { id: string; name: string; role: Role; roles: Role[] };

/** One login an email has in one clinic account: what sign-in checks before any session exists. */
export type LoginCandidate = {
  clinicId: string;
  clinicName: string;
  /** Staff of a suspended account are refused; its parents sign in read-only (decisions #26, #44). */
  active: boolean;
  accountId: string;
  passwordHash: string;
  isStaff: boolean;
  actor: Actor;
};

/** Session.user and GET /auth/me, from a live identity. Flags that are off stay absent, as in the mock's `userOf`. */
export const toSessionUser = (who: ClinicIdentity): SessionUser => ({
  id: who.user.id,
  role: who.user.role,
  name: who.user.name,
  email: who.email,
  clinicId: who.clinicId,
  roles: who.user.roles,
  readOnly: who.readOnly || undefined,
  mustChangePassword: who.mustChangePassword || undefined,
  mustAcknowledge: who.mustAcknowledge,
  staffId: who.staffId,
  guardianId: who.guardianId,
});

/**
 * Owns Credential and DemoLogin: who a session is, PIN tries, password checks and sign-in lookups. Queries about one
 * login name clinicId; sign-in's lookups (by email, the featured demo logins) are cross-clinic by design.
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
    private readonly family: FamilyService,
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

    const rows = await this.prisma.branch.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
    const all = rows.map((b) => BranchSchema.parse(b));
    const assigned = staff ? z.array(z.string()).parse(staff.branchIds) : undefined;

    return {
      clinicId,
      user: { id: accountId, name: staff?.fullName ?? cred.name, role: roles[0]!, roles },
      email: cred.email ?? "", // a parent on their mobile only (B11 decision 14)
      staffId: cred.staffId ?? undefined,
      guardianId: cred.guardianId ?? undefined,
      readOnly: suspended,
      mustChangePassword: cred.mustChange,
      mustAcknowledge: await this.pendingAcknowledgement(clinicId, accountId, roles, !!staff, !!cred.guardianId),
      branches: usableBranches(roles, assigned, all),
      children: cred.guardianId ? await this.family.childrenOf(cred.guardianId) : undefined,
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

  /**
   * Every login this email has, across clinic accounts (decision #27), in clinic-name order for the chooser.
   * Deactivated staff are left out (#23), as `allAccounts` does in the mock, so they read as a wrong password.
   */
  async loginsByEmail(email: string): Promise<LoginCandidate[]> {
    const creds = await this.prisma.credential.findMany({
      where: { email },
      select: { clinicId: true, accountId: true, staffId: true, name: true, passwordHash: true },
    });
    if (creds.length === 0) return [];
    const accounts = await this.prisma.clinicAccount.findMany({
      where: { id: { in: [...new Set(creds.map((c) => c.clinicId))] } },
      select: { id: true, name: true, status: true },
    });
    const found: LoginCandidate[] = [];
    for (const c of creds) {
      const account = accounts.find((a) => a.id === c.clinicId);
      const actor = account && (await this.actorOf(c.clinicId, c));
      if (!account || !actor) continue;
      found.push({ clinicId: c.clinicId, clinicName: account.name, active: account.status === "active", accountId: c.accountId, passwordHash: c.passwordHash, isStaff: !!c.staffId, actor });
    }
    return found.sort((a, b) => a.clinicName.localeCompare(b.clinicName));
  }

  /** The audit actor for a login; undefined for a deactivated or missing staff member. Staff are read in their clinic. */
  async actorOf(clinicId: string, cred: { accountId: string; staffId: string | null; name: string }): Promise<Actor | undefined> {
    if (!cred.staffId) return { id: cred.accountId, name: cred.name, role: "parent", roles: ["parent"] };
    const staff = await requestContext.within({ clinicId }, () => this.prisma.staff.findUnique({ where: { id: cred.staffId! } }));
    if (!staff || staff.deactivatedAt) return undefined;
    const roles = rolesOf({ role: staff.role, alsoRoles: StaffRole.array().parse(staff.alsoRoles), isOwner: staff.isOwner });
    return { id: cred.accountId, name: staff.fullName, role: roles[0]!, roles };
  }

  /** DEMO_LOGINS only (the controller 404s otherwise): one clinic's people, in login-screen order, PINs included. */
  demoAccounts(clinicId: string) {
    return this.prisma.demoLogin.findMany({
      where: { clinicId },
      orderBy: { position: "asc" },
      select: { accountId: true, role: true, name: true, email: true, summary: true, pin: true },
    });
  }

  /** The sign-in page's list: one per featured email, the demo clinic's first, each with every clinic it signs in to. */
  async demoLogins(): Promise<{ role: Role; email: string; clinics: string[] }[]> {
    const rows = await this.prisma.demoLogin.findMany({ where: { featured: true }, select: { clinicId: true, role: true, email: true, position: true } });
    const names = new Map((await this.prisma.clinicAccount.findMany({ select: { id: true, name: true } })).map((a) => [a.id, a.name]));
    const demoFirst = (id: string) => Number(id !== DEMO_CLINIC_ID);
    // Role order within each clinic, as the mock's demoLogins (packages/seed/src/logins.ts) sorts by Role.options.
    const rank = (role: Role) => RoleSchema.options.indexOf(role);
    rows.sort((a, b) => demoFirst(a.clinicId) - demoFirst(b.clinicId) || a.clinicId.localeCompare(b.clinicId) || rank(a.role) - rank(b.role) || a.position - b.position);
    const logins = new Map<string, { role: Role; email: string; clinics: string[] }>();
    for (const r of rows) {
      if (!logins.has(r.email)) logins.set(r.email, { role: r.role, email: r.email, clinics: [] });
      logins.get(r.email)!.clinics.push(names.get(r.clinicId)!);
    }
    return [...logins.values()];
  }
  /** Who may take over a device: an active staff login of this clinic with a PIN. Parents have none (data, not a role check). */
  async switchTarget(clinicId: string, accountId: string) {
    const cred = await this.prisma.credential.findUnique({ where: { clinicId_accountId: { clinicId, accountId } }, select: { staffId: true, name: true, pinHash: true } });
    if (!cred?.staffId || !cred.pinHash) return undefined;
    const actor = await this.actorOf(clinicId, { accountId, staffId: cred.staffId, name: cred.name });
    const staff = actor && (await this.prisma.staff.findUnique({ where: { id: cred.staffId }, select: { role: true, alsoRoles: true, isOwner: true, branchIds: true } }));
    if (!actor || !staff) return undefined;
    return { actor, staff: { ...staff, alsoRoles: StaffRole.array().parse(staff.alsoRoles), branchIds: z.array(z.string()).parse(staff.branchIds) } };
  }

  /** False when `current` is wrong. Otherwise the new argon2id hash is stored and mustChange cleared (decision #21). */
  async changePassword(clinicId: string, accountId: string, current: string, next: string, tx: Tx): Promise<boolean> {
    const cred = await tx.credential.findUnique({ where: { clinicId_accountId: { clinicId, accountId } }, select: { id: true, passwordHash: true } });
    if (!cred || !(await this.hasher.matches(cred.passwordHash, current))) return false;
    await tx.credential.updateMany({ where: { id: cred.id }, data: { passwordHash: await this.hasher.hash(next), mustChange: false } });
    return true;
  }

  /** The version a POST must name (the mock's expectedVersion): terms and DPA move together on the terms number. */
  async expectedVersion(kind: AcknowledgementKind): Promise<number | undefined> {
    if (kind === "terms") return LEGAL_DOCUMENTS.terms.version;
    if (kind === "confidentiality") return CONFIDENTIALITY_NOTICE.version;
    return (await this.prisma.privacyNotice.findFirst({ orderBy: { version: "desc" }, select: { version: true } }))?.version;
  }

  /** GET /auth/acknowledgement: port of acknowledgementPrompt (apps/web/src/mocks/privacy.ts), same wording. */
  async acknowledgementPrompt(clinicId: string, kind: AcknowledgementKind, guardianId?: string): Promise<AcknowledgementPrompt> {
    const { name: clinicName } = await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } });
    if (kind === "terms") {
      const { terms, dpa } = LEGAL_DOCUMENTS;
      return {
        kind, version: terms.version, clinicName, title: "Primolar's updated terms",
        paragraphs: [
          `Primolar has updated its Terms of Service (version ${terms.version}) and Data Processing Agreement (version ${dpa.version}). Read them, then accept to keep using Primolar. Your staff keep working meanwhile.`,
          `By accepting, you confirm you're authorised to act for ${clinicName}.`,
        ],
      };
    }
    if (kind === "confidentiality") {
      return { kind, version: CONFIDENTIALITY_NOTICE.version, clinicName, title: "Patient records are confidential", paragraphs: [CONFIDENTIALITY_NOTICE.text, CONFIDENTIALITY_NOTICE.more] };
    }
    const notice = await this.prisma.privacyNotice.findFirstOrThrow({ orderBy: { version: "desc" } });
    return {
      kind, version: notice.version, clinicName, title: `${clinicName}'s privacy notice`,
      paragraphs: notice.body.split(/\n{2,}/).filter((p) => p.trim()),
      contact: { name: notice.contactName, email: notice.contactEmail },
      children: guardianId ? await this.family.promptChildren(guardianId) : [],
    };
  }

  /** Records what the caller checked is due: a new Agreement (terms) or an Acknowledgement. Both append-only. */
  async acknowledge(who: ClinicIdentity, kind: AcknowledgementKind, version: number, tx: Tx): Promise<void> {
    const at = this.clock.now();
    if (kind === "terms") {
      const { terms, dpa } = LEGAL_DOCUMENTS;
      await tx.agreement.create({ data: { clinicId: who.clinicId, termsVersion: terms.version, dpaVersion: dpa.version, acceptedBy: who.user.name, at, method: "online" }, select: { id: true } });
    } else {
      await tx.acknowledgement.create({ data: { ...clinicData(), kind, version, accountId: who.user.id, name: who.user.name, at }, select: { id: true } });
    }
  }

  /** Sign-in's lookup. The hash never leaves this service and AuthService. */
  async operatorByEmail(email: string) {
    return (await this.prisma.operatorUser.findUnique({ where: { email }, select: { id: true, name: true, email: true, passwordHash: true } })) ?? undefined;
  }

  /** A new staff login's one-time secrets (decision #21) and their argon2id hashes. Call it before the transaction. */
  async newStaffSecrets(): Promise<{ temporaryPassword: string; pin: string; passwordHash: string; pinHash: string }> {
    const secrets = { temporaryPassword: temporaryPassword(), pin: newPin() };
    const [passwordHash, pinHash] = await Promise.all([this.hasher.hash(secrets.temporaryPassword), this.hasher.hash(secrets.pin)]);
    return { ...secrets, passwordHash, pinHash };
  }

  /**
   * The credential for a staff login the Owner just added, in the caller's transaction beside its staff row. It must
   * choose its own password before anything else (mustChange) and then acknowledge confidentiality (B2's gates).
   */
  async createStaffLogin(tx: Tx, login: { clinicId: string; staffId: string; email: string; name: string; passwordHash: string; pinHash: string }): Promise<void> {
    const { clinicId, staffId, email, name, passwordHash, pinHash } = login;
    await tx.credential.create({
      data: { clinicId, accountId: staffId, email, staffId, guardianId: null, name, passwordHash, mustChange: true, pinHash, pinFailedAt: [] },
      select: { id: true },
    });
  }

  /** Does a parent of this clinic sign in with this email? (decision #27: one login per email per account). */
  async parentHasEmail(tx: Tx, clinicId: string, email: string): Promise<boolean> {
    return !!(await tx.credential.findFirst({ where: { clinicId, email, guardianId: { not: null } }, select: { id: true } }));
  }
}
