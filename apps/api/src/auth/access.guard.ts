import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { requestContext } from "../common/request-context";
import { clinicRefusal, matchRoute } from "./access-rules";
import { BRANCH_COOKIE, OPERATOR_COOKIE, SESSION_COOKIE, readCookie } from "./cookies";
import { type ClinicIdentity, IdentityService } from "./identity.service";
import { SessionService } from "./session.service";

/** The path the rules are written in: no `/api` prefix, no query. */
export const rulePath = (url: string) => new URL(url, "http://api").pathname.replace(/^\/api(?=\/|$)/, "") || "/";

/** A parent's children, by patient id. Empty until patients exist (B4); B11 fills it, so own-scope routes fail closed. */
const NO_CHILDREN: ReadonlySet<string> = new Set();

/** The identity the guard loaded for each request, for the handlers that serve it (/auth/me, /clinic, /staff). */
const identities = new WeakMap<Request, ClinicIdentity>();
export const identityOf = (req: Request): ClinicIdentity | undefined => identities.get(req);

/**
 * Every request's access decision (port of `accessGate`, apps/web/src/mocks/access.ts): reads the session, fills the
 * request context (clinic, branch, user, or the operator) and applies the route map, deny by default. Registered as
 * APP_GUARD with useExisting (AuthModule), so a test can replace this class and the global guard follows.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = rulePath(req.originalUrl);
    const noRule = () => new ForbiddenException(`No access rule for ${req.method} ${path}`);
    const hit = matchRoute(req.method, path);

    if (hit?.kind === "public") return true;
    if (hit?.kind === "self") {
      // Sign-in, me and sign-out check the session themselves; give them whichever one is presented.
      if (path.startsWith("/operator/")) await this.operator(req);
      else await this.clinic(req);
      return true;
    }
    if (path.startsWith("/operator/")) {
      if (!(await this.operator(req))) throw new UnauthorizedException("Sign in to the Primolar console to continue");
      if (!hit) throw noRule();
      return true;
    }
    if (path === "/signups" || path.startsWith("/signups/") || path.startsWith("/legal/")) throw noRule();

    const who = await this.clinic(req);
    if (!who) throw new UnauthorizedException("Sign in to continue");
    if (who.mustChangePassword) throw new ForbiddenException("Choose your own password to continue");
    if (who.mustAcknowledge === "terms") throw new ForbiddenException("Accept Primolar's updated terms to continue");
    if (who.mustAcknowledge === "confidentiality") throw new ForbiddenException("Acknowledge patient confidentiality to continue");
    if (hit?.kind !== "clinic") throw noRule();
    if (who.readOnly && req.method !== "GET" && !hit.rule.exportRead) {
      throw new ForbiddenException("Your clinic's account is paused, so you can view records but not make changes. Contact your clinic.");
    }
    const refused = clinicRefusal(who.user.roles, hit.rule, hit.params, new URL(req.originalUrl, "http://api").searchParams, NO_CHILDREN);
    if (refused) throw new ForbiddenException(refused);
    return true;
  }

  /** pd_session into the request context (clinic, user, branch). A session whose login can't work any more is closed. */
  private async clinic(req: Request): Promise<ClinicIdentity | undefined> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const session = await this.sessions.resolveClinic(token);
    if (!session) return undefined;
    requestContext.assign({ clinicId: session.clinicId }); // first: the identity reads are clinic-scoped
    const who = await this.identity.forSession(session);
    if (!who) {
      await this.sessions.closeClinic(token!);
      requestContext.assign({ clinicId: undefined });
      return undefined;
    }
    requestContext.assign({ user: who.user, branchId: this.identity.branchFor(who, readCookie(req.headers.cookie, BRANCH_COOKIE))?.id });
    identities.set(req, who);
    return who;
  }

  /** pd_operator only: a clinic cookie is never read here, and the operator never gets a clinic (decision #25). */
  private async operator(req: Request): Promise<boolean> {
    const session = await this.sessions.resolveOperator(readCookie(req.headers.cookie, OPERATOR_COOKIE));
    if (!session || !(await this.identity.operator(session.operatorId))) return false;
    requestContext.assign({ operator: true, operatorId: session.operatorId });
    return true;
  }
}
