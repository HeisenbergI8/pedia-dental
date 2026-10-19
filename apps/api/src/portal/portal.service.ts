import { randomBytes } from "node:crypto";
import { ConflictException, GoneException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { DEMO_CLINIC_ID } from "@pedia/seed";
import {
  PORTAL_LINK_LIFETIME_MS, accountText, linkPath, maskedNumber, smsNumber,
  type DemoTexts, type PasswordLink, type PasswordLinkInput, type PasswordResetInput, type PortalAccess, type PortalLinkPurpose, type Session, type SetPasswordInput,
} from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { Hasher } from "../auth/hashing";
import { IdentityService, type ClinicIdentity } from "../auth/identity.service";
import { RATE_LIMITS, RateLimitService, hashedBucketOf } from "../auth/rate-limit";
import { SessionService, hashToken } from "../auth/session.service";
import { lockAccount, ownClinicId } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { ENV, type Env } from "../config/env";
import { AccountLinks } from "../message-queue/account-links";
import { MessageQueueService } from "../message-queue/message-queue.service";
import { FamilyService, type FamilyGuardian } from "../patients/family.service";
import { lockPatient } from "../patients/patient-lock";
import type { Viewer } from "../patients/patient.views";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";

const GONE = "This link has expired or was already used.";
/** B13c2a: an expired link is kept this long for support questions, then pruned (decisions.md E9: not a legal threshold). */
export const KEEP_LINK_DAYS = 30;
const parentId = (guardianId: string) => `guardian.${guardianId}`;
const clashText = (g: Pick<FamilyGuardian, "phone">, holder: Pick<FamilyGuardian, "fullName">) =>
  `${maskedNumber(g.phone)} already signs in to the portal as ${holder.fullName}. Each parent needs their own mobile number.`;
/** The state a link's purpose needs: an invite opens an invited account, a reset an active one. */
const NEEDS = { invite: "invited", reset: "active" } as const satisfies Record<PortalLinkPurpose, string>;

type LinkRow = { id: string; clinicId: string; guardianId: string; purpose: PortalLinkPurpose; expiresAt: Date; usedAt: Date | null; cancelledAt: Date | null };

/**
 * B11: parents' portal accounts (features/portal/mocks.ts). Owns PortalAccount and PortalLink; a parent's Credential is
 * IdentityService's, their texts MessageQueueService's. Every write takes the clinic's lock first (E8), then the
 * patient's; texts are withdrawn before their links are cancelled (E9: Message, then PortalLink, as the sender holds them).
 */
@Injectable()
export class PortalService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly family: FamilyService,
    private readonly identity: IdentityService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly hasher: Hasher,
    private readonly limits: RateLimitService,
    private readonly queue: MessageQueueService,
    private readonly links: AccountLinks,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.links.register((tx, linkId) => this.mint(tx, linkId));
  }

  /**
   * E5: the token is drawn when the text is sent, inside the sender's claim. Only its SHA-256 is kept (and, on a demo
   * deployment, the token itself for GET /auth/demo-texts). A resent text draws a new one, so only the last text works.
   */
  private async mint(tx: Tx, linkId: string): Promise<string | undefined> {
    const [link] = await tx.$queryRaw<LinkRow[]>`
      SELECT id, clinicId, guardianId, purpose, expiresAt, usedAt, cancelledAt FROM PortalLink WHERE id = ${linkId} AND clinicId = ${ownClinicId()} FOR UPDATE`;
    if (!link || !this.live(link)) return undefined;
    const token = randomBytes(24).toString("base64url");
    await tx.portalLink.update({ where: { id: linkId }, data: { tokenHash: hashToken(token), demoToken: this.env.DEMO_LOGINS ? token : null }, select: { id: true } });
    return `${this.env.WEB_URL}${linkPath(token)}`;
  }

  private live(l: Pick<LinkRow, "usedAt" | "cancelledAt" | "expiresAt">): boolean {
    return !l.usedAt && !l.cancelledAt && l.expiresAt > this.clock.now();
  }

  // ── Staff (portal.manage) ─────────────────────────────────────────────────────────────────────────────────────

  /** GET /patients/:id/portal-access: each guardian's status, in the record's order (decision 17). */
  async access(patientId: string): Promise<PortalAccess[]> {
    const family = await this.family.familyOf(this.prisma, patientId);
    if (!family) throw new NotFoundException("Patient not found");
    await this.audit.record("view", "Portal access", patientId);
    return Promise.all(family.guardians.map((g) => this.accessOf(this.prisma, g)));
  }

  private async accessOf(tx: Tx, g: FamilyGuardian): Promise<PortalAccess> {
    const clinicId = ownClinicId();
    const [a, invite] = await Promise.all([
      tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId, guardianId: g.guardianId } } }),
      tx.portalLink.findFirst({ where: { clinicId, guardianId: g.guardianId, purpose: "invite", cancelledAt: null }, orderBy: { createdAt: "desc" }, select: { expiresAt: true } }),
    ]);
    const iso = (d: Date | null | undefined) => d?.toISOString();
    return {
      guardianId: g.guardianId,
      state: a?.state ?? "not_invited",
      ...(a?.invitedAt && { invitedAt: iso(a.invitedAt) }),
      ...(a?.state === "invited" && invite && { inviteExpiresAt: iso(invite.expiresAt) }),
      ...(a?.state === "active" && a.activatedAt && { activatedAt: iso(a.activatedAt) }),
      ...(a?.state === "off" && a.turnedOffAt && { turnedOffAt: iso(a.turnedOffAt) }),
      ...(a?.state !== "active" && { blocked: await this.blocked(tx, g) }),
    };
  }

  /** Why this guardian can't be invited now (decisions 1, 14), in the words the Overview shows. */
  private async blocked(tx: Tx, g: FamilyGuardian): Promise<string | undefined> {
    const n = smsNumber(g.phone);
    if (!n) return `Add a mobile number for ${g.fullName} to invite them`;
    const holder = await this.numberHolder(tx, n, g.guardianId);
    return holder && clashText(g, holder);
  }

  /**
   * Decision 14: the other guardian of this clinic who signs in with this mobile (a login) or was invited on it.
   * `invitedToo: false` asks about logins only (accepting an invite: an older invite on the number may lose the race).
   */
  async numberHolder(tx: Tx, n: string, exceptGuardianId: string, invitedToo = true): Promise<FamilyGuardian | undefined> {
    const active = await this.identity.phoneHolder(tx, ownClinicId(), n, exceptGuardianId);
    const invited = invitedToo
      ? (await tx.portalAccount.findMany({ where: { state: "invited", guardianId: { not: exceptGuardianId } }, select: { guardianId: true } })).map((a) => a.guardianId)
      : [];
    const candidates = await this.family.guardians(tx, [...(active ? [active] : []), ...invited]);
    return candidates.find((c) => c.guardianId === active || smsNumber(c.phone) === n);
  }

  /** The guardian a staff route names, under the patient's lock: 404s in the mock's words. */
  private async guardianOn(tx: Tx, patientId: string, guardianId: string): Promise<{ g: FamilyGuardian; firstName: string }> {
    await lockPatient(tx, patientId);
    const family = await this.family.familyOf(tx, patientId);
    const g = family?.guardians.find((x) => x.guardianId === guardianId);
    if (!family || !g) throw new NotFoundException(`This guardian isn't on ${family?.firstName ?? "this child"}'s record`);
    return { g, firstName: family.firstName };
  }

  /** Withdraws the waiting texts of this guardian's live links, then cancels the links (E9's order). */
  private async cancelLinks(tx: Tx, guardianId: string, purpose?: PortalLinkPurpose): Promise<void> {
    const now = this.clock.now();
    const where = { clinicId: ownClinicId(), guardianId, ...(purpose && { purpose }), usedAt: null, cancelledAt: null, expiresAt: { gt: now } };
    const live = await tx.portalLink.findMany({ where, select: { id: true } });
    await this.queue.withdrawLinks(tx, live.map((l) => l.id));
    if (live.length) await tx.portalLink.updateMany({ where: { id: { in: live.map((l) => l.id) } }, data: { cancelledAt: now } });
  }

  /** A new link, and its text in the log with [link] (E4); sent now, at any hour (decisions 3, 12, 20). */
  private async sendLink(tx: Tx, purpose: PortalLinkPurpose, g: FamilyGuardian, patientId: string, childName?: string): Promise<void> {
    const clinicId = ownClinicId();
    const now = this.clock.now();
    const link = await tx.portalLink.create({
      data: { clinicId, guardianId: g.guardianId, purpose, createdAt: now, expiresAt: new Date(now.getTime() + PORTAL_LINK_LIFETIME_MS[purpose]) },
      select: { id: true },
    });
    const { name: clinicName } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } });
    await this.queue.queueAccountText(tx, {
      kind: purpose === "invite" ? "portal_invite" : "password_reset",
      patientId,
      guardian: g,
      linkId: link.id,
      body: accountText(purpose, { clinicName, childName }),
    });
  }

  /** POST …/portal-invite: invite, or resend (decision 5: the older link and its text are withdrawn). */
  async invite(viewer: Viewer, patientId: string, guardianId: string): Promise<PortalAccess> {
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      const { g, firstName } = await this.guardianOn(tx, patientId, guardianId);
      const a = await tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId, guardianId } }, select: { state: true } });
      if (a?.state === "active") throw new ConflictException(`${g.fullName} already uses the portal`);
      const blocked = await this.blocked(tx, g);
      if (blocked) throw new ConflictException(blocked);
      await this.cancelLinks(tx, guardianId);
      const now = this.clock.now();
      const invited = { state: "invited" as const, invitedAt: now, invitedBy: viewer.name, turnedOffAt: null };
      await tx.portalAccount.upsert({
        where: { clinicId_guardianId: { clinicId, guardianId } },
        create: { ...clinicData(), guardianId, ...invited },
        update: invited,
        select: { guardianId: true },
      });
      await this.sendLink(tx, "invite", g, patientId, firstName);
      await this.audit.record("create", "Portal invitation", patientId, tx);
      return this.accessOf(tx, g);
    });
  }

  /** POST …/portal-off (decision 18): links and texts withdrawn, the login removed, then its sessions ended. */
  async turnOff(patientId: string, guardianId: string): Promise<PortalAccess> {
    const clinicId = ownClinicId();
    const status = await runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx);
      const { g } = await this.guardianOn(tx, patientId, guardianId);
      const a = await tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId, guardianId } }, select: { state: true } });
      if (!a || a.state === "off") throw new ConflictException(`${g.fullName} doesn't have portal access`);
      await this.cancelLinks(tx, guardianId);
      await tx.portalAccount.update({ where: { clinicId_guardianId: { clinicId, guardianId } }, data: { state: "off", turnedOffAt: this.clock.now() }, select: { guardianId: true } });
      await this.identity.removeParentLogin(tx, clinicId, guardianId);
      await this.audit.record("update", "Portal access (turned off)", patientId, tx);
      return this.accessOf(tx, g);
    });
    await this.sessions.closeAllFor(clinicId, parentId(guardianId)); // after the commit, as changePassword (E10)
    return status;
  }

  /**
   * Decision 15, from a guardian edit (PatientWritesService, in its transaction, after its locks): the mobile sign-in
   * follows the new number, and links already texted to the old one stop working. 409 when another parent signs in
   * with it or was invited on it (decision 14) and this guardian has portal access. Returns the login whose sessions
   * the caller ends after its commit.
   */
  async numberChanged(tx: Tx, g: FamilyGuardian): Promise<string | undefined> {
    const clinicId = ownClinicId();
    const a = await tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId, guardianId: g.guardianId } }, select: { state: true } });
    if (!a || a.state === "off") return undefined;
    const n = smsNumber(g.phone);
    const holder = n ? await this.numberHolder(tx, n, g.guardianId) : undefined;
    if (holder) throw new ConflictException(clashText(g, holder));
    // A link already texted went to the old number (a lost phone, a typo): it stops working. Staff resend an invite.
    await this.cancelLinks(tx, g.guardianId);
    if (a.state !== "active") return undefined; // an invite reads the number when it is accepted
    const moved = await this.identity.followPhone(tx, clinicId, g.guardianId, n ?? null, clashText(g, { fullName: "another parent" }));
    return moved ? parentId(g.guardianId) : undefined;
  }

  // ── Signed out (/auth/*) ───────────────────────────────────────────────────────────────────────────────────────

  /** A link's row by its token, in its clinic, if it can still be used for its purpose. Read inside that clinic. */
  private async usable(token: string, tx: Tx = this.prisma): Promise<{ link: LinkRow; g: FamilyGuardian & { firstChildId: string } } | undefined> {
    const link = await tx.portalLink.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, clinicId: true, guardianId: true, purpose: true, expiresAt: true, usedAt: true, cancelledAt: true },
    });
    if (!link || !this.live(link) || link.clinicId !== ownClinicId()) return undefined;
    const a = await tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId: link.clinicId, guardianId: link.guardianId } }, select: { state: true } });
    const [g] = await this.family.guardians(tx, [link.guardianId]); // none: taken off every child (decision 10)
    return a?.state === NEEDS[link.purpose] && g ? { link, g } : undefined;
  }

  /** The clinic a token names, so the rest runs in that clinic's context. Undefined for any token that names none. */
  private async clinicOf(token: string): Promise<string | undefined> {
    return (await this.prisma.portalLink.findUnique({ where: { tokenHash: hashToken(token) }, select: { clinicId: true } }))?.clinicId;
  }

  /** POST /auth/password-link: what a working link is for (E1). One 410 for unknown, used, cancelled and expired. */
  async check({ token }: PasswordLinkInput): Promise<PasswordLink> {
    const clinicId = await this.clinicOf(token);
    if (!clinicId) throw new GoneException(GONE);
    return requestContext.within({ clinicId }, async () => {
      const hit = await this.usable(token);
      if (!hit) throw new GoneException(GONE);
      const { name: clinicName } = await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } });
      return { purpose: hit.link.purpose, name: hit.g.fullName, clinicName, login: maskedNumber(hit.g.phone) };
    });
  }

  /**
   * POST /auth/password-link/accept: sets the password and signs in (decisions 5, 6, 8, 22). Single use: the link is
   * locked, checked again and marked used in one transaction. A reset ends the parent's other sessions.
   */
  async accept({ token, password }: SetPasswordInput): Promise<{ token: string; session: Session }> {
    const clinicId = await this.clinicOf(token);
    if (!clinicId) throw new GoneException(GONE);
    const passwordHash = await this.hasher.hash(password); // slow work before the transaction (CONVENTIONS)
    const { accountId, purpose } = await requestContext.within({ clinicId }, () =>
      runInTransaction(this.prisma, async (tx) => {
        await lockAccount(tx);
        await tx.$queryRaw`SELECT id FROM PortalLink WHERE tokenHash = ${hashToken(token)} AND clinicId = ${clinicId} FOR UPDATE`;
        const hit = await this.usable(token, tx);
        if (!hit) throw new GoneException(GONE);
        const { link, g } = hit;
        const now = this.clock.now();
        const accountId = parentId(g.guardianId);
        if (link.purpose === "invite") {
          const n = smsNumber(g.phone);
          if (!n) throw new ConflictException("Your clinic needs your mobile number first. Ask them to add it and send a new invite.");
          const holder = await this.numberHolder(tx, n, g.guardianId, false);
          if (holder) throw new ConflictException(clashText(g, holder));
          const email = g.email?.trim().toLowerCase() || null;
          // Decision 14: a shared email isn't refused; this parent then signs in with their number only.
          const free = email && !(await this.identity.emailTaken(tx, clinicId, email)) ? email : null;
          await this.identity.createParentLogin(tx, { clinicId, guardianId: g.guardianId, name: g.fullName, phone: n, email: free, passwordHash }, clashText(g, { fullName: "another parent" }));
          await tx.portalAccount.update({ where: { clinicId_guardianId: { clinicId, guardianId: g.guardianId } }, data: { state: "active", activatedAt: now }, select: { guardianId: true } });
        } else if (!(await this.identity.setParentPassword(tx, clinicId, g.guardianId, passwordHash))) {
          throw new GoneException(GONE);
        }
        await tx.portalLink.update({ where: { id: link.id }, data: { usedAt: now }, select: { id: true } });
        const actor = { id: accountId, name: g.fullName, role: "parent" as const, roles: ["parent" as const] };
        await requestContext.within({ user: actor }, () => this.audit.record("update", link.purpose === "invite" ? "Portal access (activated)" : "Password (reset)", undefined, tx));
        return { accountId, purpose: link.purpose };
      }),
    );
    if (purpose === "reset") await this.sessions.closeAllFor(clinicId, accountId); // every device on the old password
    return this.auth.open(clinicId, accountId);
  }

  /**
   * POST /auth/password-reset (decisions 6, 19): 202 whether or not an account exists. Counted first, per number or
   * email, so a 429 says nothing either. Parents only: staff ask their Owner.
   */
  async requestReset({ login }: PasswordResetInput): Promise<Record<string, never>> {
    const { allowed } = await this.limits.hitRolling(hashedBucketOf("reset", login), RATE_LIMITS.reset);
    if (!allowed) throw new HttpException("Too many reset texts for this number. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
    for (const m of await this.identity.loginsBy(login)) {
      if (m.isStaff) continue;
      const guardianId = m.accountId.slice("guardian.".length);
      await requestContext.within({ clinicId: m.clinicId, user: m.actor }, () =>
        runInTransaction(this.prisma, async (tx) => {
          const clinicId = await lockAccount(tx);
          const a = await tx.portalAccount.findUnique({ where: { clinicId_guardianId: { clinicId, guardianId } }, select: { state: true } });
          const [g] = await this.family.guardians(tx, [guardianId]);
          if (a?.state !== "active" || !g || !smsNumber(g.phone)) return;
          await this.cancelLinks(tx, guardianId, "reset"); // only the newest reset text works
          await this.sendLink(tx, "reset", g, g.firstChildId);
          await this.audit.record("create", "Password reset (requested)", undefined, tx);
        }),
      );
    }
    return {};
  }

  /** GET /auth/demo-texts: demo deployments only (E6), else a 404. Signed in: this clinic's; signed out: the demo clinic's. */
  async demoTexts(who: ClinicIdentity | undefined): Promise<DemoTexts> {
    if (!this.env.DEMO_LOGINS) throw new NotFoundException("Not found");
    const clinicId = who?.clinicId ?? DEMO_CLINIC_ID;
    const rows = await this.prisma.portalLink.findMany({
      where: { clinicId, demoToken: { not: null }, usedAt: null, cancelledAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: { guardianId: true, purpose: true, demoToken: true, expiresAt: true },
    });
    const names = new Map(
      (await requestContext.within({ clinicId }, () => this.family.guardians(this.prisma, rows.map((r) => r.guardianId)))).map((g) => [g.guardianId, g.fullName]),
    );
    return {
      texts: rows.map((r) => ({ name: names.get(r.guardianId) ?? "A parent", purpose: r.purpose, link: linkPath(r.demoToken!), expiresAt: r.expiresAt.toISOString() })),
    };
  }

  /**
   * B13c2a: links whose expiry passed more than KEEP_LINK_DAYS ago, every clinic, 1,000 at a time. A used or cancelled
   * link has expired too (its lifetime is fixed at creation). The card reads a missing invite as "Invite expired",
   * which it already was. PortalLink is a platform table (model-scope.ts), so the delete names no clinic on purpose.
   */
  async pruneLinks(now = this.clock.now()): Promise<number> {
    const before = new Date(now.getTime() - KEEP_LINK_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 23).replace("T", " ");
    let total = 0;
    for (;;) {
      const n = await this.prisma.$executeRaw`DELETE FROM PortalLink WHERE expiresAt < ${before} LIMIT 1000`;
      total += n;
      if (n < 1000) return total;
    }
  }
}
