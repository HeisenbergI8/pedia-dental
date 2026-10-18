import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { AcknowledgeInput, ChangePasswordInput, SwitchUserInput, rolesCan, worksAt, type AcknowledgementPrompt, type AuditAction, type Branch, type DemoAccounts, type LoginInput, type LoginResult, type OperatorLoginInput, type OperatorSession, type Session } from "@pedia/shared";
import { DEMO_CLINIC_ID, DEMO_PASSWORD } from "@pedia/seed";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import type { ZodType } from "zod";
import { Hasher } from "./hashing";
import { type Actor, type ClinicIdentity, IdentityService, type LoginCandidate, toSessionUser } from "./identity.service";
import { SessionService } from "./session.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";
import { OperatorAuditService } from "../operator-audit/operator-audit.service";

/** The body's token (decision 1). The real one is set only as the httpOnly cookie; the shared schema still wants a string. */
export const COOKIE_TOKEN = "cookie";
/** OperatorSession.token must start `operator.`; the real token is only in pd_operator (decision 1). */
export const OPERATOR_COOKIE_TOKEN = "operator.cookie";

/** How a PIN switch reads in the audit trail (the mock's PIN_SWITCH). */
const PIN_SWITCH = "Session (PIN switch)";
const lockedMessage = (until: string, now: Date) => {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - now.getTime()) / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or sign out and sign in with your password.`;
};
/** The same pipe the decorators use, applied after a handler's own session checks. */
const parse = <T extends ZodType>(schema: T, body: unknown) => new ZodValidationPipe(schema).transform(body);

/**
 * Sign-in, sign-out and the session steps: port of authHandlers (apps/web/src/features/auth/mocks.ts). Owns no table:
 * it orchestrates IdentityService, SessionService and AuditService.
 */
@Injectable()
export class AuthService {
  /** A real argon2id hash, checked when an email has no login, so a miss costs what a hit does. */
  private decoy?: Promise<string>;

  constructor(
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly hasher: Hasher,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService, // only for runInTransaction: the rows belong to IdentityService and AuditService
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly operatorAudit: OperatorAuditService,
  ) {}

  /** An entry in the account it names, signed in or not (the mock's `logEach`: selectTenant, then recordAudit). */
  private auditAs(clinicId: string, actor: Actor, action: AuditAction, record: string): Promise<void> {
    return requestContext.within({ clinicId, user: actor }, () => this.audit.record(action, record));
  }

  /** A new session for a login that passed its checks, and the Session the web parses. */
  async open(clinicId: string, accountId: string): Promise<{ token: string; session: Session }> {
    const token = await this.sessions.openClinic(clinicId, accountId);
    const who = await requestContext.within({ clinicId }, () => this.identity.forSession({ clinicId, accountId }));
    if (!who) throw new UnauthorizedException("Sign in to continue");
    return { token, session: { token: COOKIE_TOKEN, user: toSessionUser(who) } };
  }

  /** POST /auth/login, in the mock's order: the password, then suspension, then which clinic (decision #27). */
  async login({ email, password, clinicId }: LoginInput): Promise<{ result: LoginResult; token?: string }> {
    const matches = await this.identity.loginsBy(email); // `email` holds a mobile or an email (LoginId, B11 decision 4)
    if (matches.length === 0) await this.hasher.matches(await (this.decoy ??= this.hasher.hash("no such login")), password);
    const opened: LoginCandidate[] = [];
    for (const m of matches) if (await this.hasher.matches(m.passwordHash, password)) opened.push(m);
    if (opened.length === 0) {
      // Each failure is logged in the account it names; an unknown email has no one to log against.
      for (const m of matches) await this.auditAs(m.clinicId, m.actor, "sign_in_failed", "Session");
      throw new UnauthorizedException("That mobile number or email and password don't match an account");
    }
    // B12 decision 4: the subscription check at sign-in, before the active check, so a lapsed clinic is paused now
    // rather than at the nightly job. Only after a correct password. Then each match's account is read again.
    for (const clinicId of new Set(opened.map((m) => m.clinicId))) await this.subscriptions.settle(clinicId);
    const fresh = (await this.identity.loginsBy(email)).filter((f) => opened.some((m) => m.clinicId === f.clinicId && m.accountId === f.accountId));
    // Checked after the password, so a stranger can't learn that an account is suspended. B12 decision 25: the Owner of
    // a clinic paused for non-payment signs in to pay.
    const open = fresh.filter((m) => m.active || !m.isStaff || m.billingOnly);
    if (open.length === 0) {
      for (const m of fresh) await this.auditAs(m.clinicId, m.actor, "denied", "Session (account suspended)");
      throw new ForbiddenException("Your clinic's Primolar account is paused. Contact your clinic.");
    }
    const match = clinicId ? open.find((m) => m.clinicId === clinicId) : open.length === 1 ? open[0] : undefined;
    if (!match) {
      if (clinicId) throw new BadRequestException("Choose one of your clinics");
      return { result: { choices: open.map((m) => ({ clinicId: m.clinicId, name: m.clinicName })) } };
    }
    await this.auditAs(match.clinicId, match.actor, "sign_in", "Session");
    const { token, session } = await this.open(match.clinicId, match.accountId);
    return { result: session, token };
  }

  /** POST /auth/logout: audited as the person leaving (the guard put them in the context), then the row deleted. */
  async logout(who: ClinicIdentity | undefined, token: string | undefined, reason: "user" | "idle"): Promise<void> {
    if (who) await this.audit.record(reason === "idle" ? "timed_out" : "sign_out", "Session");
    if (token) await this.sessions.closeClinic(token);
  }

  /** GET /auth/demo-accounts: signed in, this account's people (the Switch user hints); signed out, the demo clinic's. */
  async demoAccounts(who: ClinicIdentity | undefined): Promise<DemoAccounts> {
    const rows = await this.identity.demoAccounts(who?.clinicId ?? DEMO_CLINIC_ID);
    return {
      password: DEMO_PASSWORD,
      accounts: rows.map(({ accountId, pin, ...a }) => ({ id: accountId, ...a, ...(pin ? { pin } : {}) })),
      logins: await this.identity.demoLogins(),
    };
  }

  /** The same login, its flags read again (a step that just cleared). The cookie is unchanged. */
  private async refreshed(who: ClinicIdentity): Promise<Session> {
    const fresh = await this.identity.forSession({ clinicId: who.clinicId, accountId: who.user.id });
    if (!fresh) throw new UnauthorizedException("Sign in to continue");
    return { token: COOKIE_TOKEN, user: toSessionUser(fresh) };
  }

  /** POST /auth/switch: another staff member takes this device with their own PIN (decision #24), logged as one leaving and one arriving. */
  async switchUser(current: ClinicIdentity | undefined, token: string | undefined, device: Branch | undefined, body: unknown) {
    if (!current || !token) throw new UnauthorizedException("Sign in to continue");
    if (!rolesCan(current.user.roles, "session.switch")) throw new ForbiddenException("Switching user is for clinic staff");
    if (current.mustChangePassword) throw new ForbiddenException("Choose your own password to continue");
    const { accountId, pin } = parse(SwitchUserInput, body);
    const target = await this.identity.switchTarget(current.clinicId, accountId);
    if (!target) throw new BadRequestException("Choose a staff member from the list");
    // Not a PIN attempt, so before the lockout (decision #24: only staff who work at this device's branch).
    if (!device || !worksAt(target.staff, device)) {
      throw new BadRequestException(`${target.actor.name} doesn't work at ${device?.name ?? "this branch"}. They can sign in with their password.`);
    }
    const attempt = await this.identity.checkPin(current.clinicId, accountId, pin);
    const now = this.clock.now();
    if (!attempt) throw new BadRequestException("Choose a staff member from the list");
    if (attempt.outcome === "locked") {
      await this.auditAs(current.clinicId, target.actor, "denied", PIN_SWITCH);
      throw new HttpException(lockedMessage(attempt.until, now), HttpStatus.TOO_MANY_REQUESTS);
    }
    if (attempt.outcome === "wrong") {
      await this.auditAs(current.clinicId, target.actor, "sign_in_failed", PIN_SWITCH);
      if (attempt.locked) throw new HttpException(lockedMessage(attempt.locked.until, now), HttpStatus.TOO_MANY_REQUESTS);
      const left = `${attempt.attemptsLeft} ${attempt.attemptsLeft === 1 ? "try" : "tries"} left`;
      throw new UnauthorizedException(`That PIN isn't right for ${target.actor.name}. ${left}.`);
    }
    await this.audit.record("sign_out", "Session (switched user)"); // the person leaving is still in the context
    await this.auditAs(current.clinicId, target.actor, "sign_in", PIN_SWITCH);
    await this.sessions.closeClinic(token);
    return this.open(current.clinicId, accountId);
  }

  /**
   * POST /auth/password: a staff login at first sign-in with the temporary password (decision #21) or any time after;
   * a parent any time (B11 decision 7).
   */
  async changePassword(who: ClinicIdentity | undefined, body: unknown) {
    if (!who) throw new UnauthorizedException("Sign in to change your password");
    const { current, next } = parse(ChangePasswordInput, body);
    // Decision 4: on a demo deployment the shown password stays the shown password.
    if (this.env.DEMO_LOGINS && current === DEMO_PASSWORD) throw new ForbiddenException(`Demo logins keep the demo password (${DEMO_PASSWORD})`);
    const changed = await runInTransaction(this.prisma, async (tx) => {
      const ok = await this.identity.changePassword(who.clinicId, who.user.id, current, next, tx);
      await this.audit.record(ok ? "update" : "denied", "Password", undefined, tx);
      return ok;
    });
    if (!changed) throw new BadRequestException("That isn't your current password");
    await this.sessions.closeAllFor(who.clinicId, who.user.id); // every device signed in with the old password
    return this.open(who.clinicId, who.user.id);
  }

  /** GET /auth/acknowledgement (privacy P10): the page this login must read before continuing. */
  async acknowledgementPrompt(who: ClinicIdentity | undefined): Promise<AcknowledgementPrompt> {
    if (!who) throw new UnauthorizedException("Sign in to continue");
    if (!who.mustAcknowledge) throw new ConflictException("Nothing is waiting for you to read");
    return this.identity.acknowledgementPrompt(who.clinicId, who.mustAcknowledge, who.guardianId);
  }

  /** POST /auth/acknowledgement: only the step waiting, at its current version, so a stale page can't accept an old text. */
  async acknowledge(who: ClinicIdentity | undefined, body: unknown): Promise<Session> {
    if (!who) throw new UnauthorizedException("Sign in to continue");
    if (who.mustChangePassword) throw new ForbiddenException("Choose your own password to continue");
    const { kind, version } = parse(AcknowledgeInput, body);
    if (kind !== who.mustAcknowledge || version !== (await this.identity.expectedVersion(kind))) {
      throw new ConflictException("That isn't the version waiting for you. Reload the page and read it again.");
    }
    const record = kind === "terms" ? "Terms and DPA (accepted)" : kind === "notice" ? "Privacy notice (acknowledged)" : "Confidentiality (acknowledged)";
    await runInTransaction(this.prisma, async (tx) => {
      await this.identity.acknowledge(who, kind, version, tx);
      await this.audit.record("create", record, undefined, tx);
    });
    return this.refreshed(who);
  }

  /** POST /operator/auth/login: one message for a wrong password and an unknown email, as the clinic sign-in. */
  async operatorLogin({ email, password }: OperatorLoginInput): Promise<{ token: string; session: OperatorSession }> {
    const op = await this.identity.operatorByEmail(email);
    const ok = await this.hasher.matches(op?.passwordHash ?? (await (this.decoy ??= this.hasher.hash("no such login"))), password);
    if (!op || !ok) {
      // A wrong password for a known operator is recorded; an unknown email has no one to record it against.
      if (op) await this.operatorAudit.recordFor(op, "sign_in_failed", "Console", "Wrong password");
      throw new UnauthorizedException("That email and password don't match a Primolar operator");
    }
    const token = await this.sessions.openOperator(op.id);
    await this.operatorAudit.recordFor(op, "sign_in", "Console", "Signed in");
    return { token, session: { token: OPERATOR_COOKIE_TOKEN, operator: { id: op.id, name: op.name, email: op.email } } };
  }

  operatorLogout(token: string): Promise<void> {
    return this.sessions.closeOperator(token);
  }
}
