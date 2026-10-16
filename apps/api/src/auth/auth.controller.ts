import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { LoginInput, LogoutInput, type DemoAccounts, type LoginResult, type SessionUser } from "@pedia/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { identityOf } from "./access.guard";
import { AuthService } from "./auth.service";
import { BRANCH_COOKIE, SESSION_COOKIE, readCookie, sessionCookieOptions } from "./cookies";
import { IdentityService, toSessionUser } from "./identity.service";

/** The mock reads an absent sign-out body as `{}` (reason: user). The same schema, applied to `{}` when there is none. */
const LogoutBody = z.preprocess((body) => body ?? {}, LogoutInput);

/**
 * /auth/*: the API contract in apps/web/src/features/auth/mocks.ts. Every route is self-checked (SELF_CHECKED_RULES):
 * the guard loads a session when one is presented and requires none, so each handler checks what it needs.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly identity: IdentityService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Demo deployments only (B2 "Decide first"): anywhere else the route doesn't exist. */
  @Get("demo-accounts")
  demoAccounts(@Req() req: Request): Promise<DemoAccounts> {
    if (!this.env.DEMO_LOGINS) throw new NotFoundException("Not found");
    return this.auth.demoAccounts(identityOf(req));
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(LoginInput)) input: LoginInput, @Res({ passthrough: true }) res: Response): Promise<LoginResult> {
    const { result, token } = await this.auth.login(input);
    if (token) res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return result;
  }

  @Get("me")
  me(@Req() req: Request): SessionUser {
    const who = identityOf(req);
    if (!who) throw new UnauthorizedException("Sign in to continue");
    return toSessionUser(who);
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Body(new ZodValidationPipe(LogoutBody)) body: z.output<typeof LogoutInput>, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(identityOf(req), readCookie(req.headers.cookie, SESSION_COOKIE), body.reason);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.env));
    return {};
  }

  /** Session checks come before the body here (the mock's order), so the body is parsed in the service. */
  @Post("switch")
  @HttpCode(200)
  async switch(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const who = identityOf(req);
    const device = who && this.identity.branchFor(who, readCookie(req.headers.cookie, BRANCH_COOKIE));
    const { token, session } = await this.auth.switchUser(who, readCookie(req.headers.cookie, SESSION_COOKIE), device, body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return session;
  }

  @Post("password")
  @HttpCode(200)
  async password(@Req() req: Request, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token, session } = await this.auth.changePassword(identityOf(req), body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return session;
  }

  @Get("acknowledgement")
  acknowledgementPrompt(@Req() req: Request) {
    return this.auth.acknowledgementPrompt(identityOf(req));
  }

  @Post("acknowledgement")
  @HttpCode(200)
  acknowledge(@Req() req: Request, @Body() body: unknown) {
    return this.auth.acknowledge(identityOf(req), body);
  }
}
