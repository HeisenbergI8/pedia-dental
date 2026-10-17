import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { PasswordLinkInput, PasswordResetInput, SetPasswordInput, type DemoTexts, type PasswordLink, type Session } from "@pedia/shared";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/cookies";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { PortalService } from "./portal.service";

/**
 * features/portal/mocks.ts, signed-out routes (B11 E1). Self-checked (SELF_CHECKED_RULES) and rate-limited per address
 * like the rest of /auth (PortalModule). Tokens travel in bodies, never paths: paths are logged.
 */
@Controller("auth")
export class PasswordLinksController {
  constructor(
    private readonly portal: PortalService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("password-link")
  @HttpCode(200)
  check(@Body(new ZodValidationPipe(PasswordLinkInput)) input: PasswordLinkInput): Promise<PasswordLink> {
    return this.portal.check(input);
  }

  @Post("password-link/accept")
  @HttpCode(200)
  async accept(@Body(new ZodValidationPipe(SetPasswordInput)) input: SetPasswordInput, @Res({ passthrough: true }) res: Response): Promise<Session> {
    const { token, session } = await this.portal.accept(input);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.env));
    return session;
  }

  @Post("password-reset")
  @HttpCode(202)
  reset(@Body(new ZodValidationPipe(PasswordResetInput)) input: PasswordResetInput) {
    return this.portal.requestReset(input);
  }

  /** Demo deployments only (E6): anywhere else the route doesn't exist. */
  @Get("demo-texts")
  demoTexts(@Req() req: Request): Promise<DemoTexts> {
    return this.portal.demoTexts(identityOf(req));
  }
}
