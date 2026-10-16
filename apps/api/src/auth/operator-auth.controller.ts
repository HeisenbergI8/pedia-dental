import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { OperatorLoginInput, type OperatorSession, type OperatorUser } from "@pedia/shared";
import type { Request, Response } from "express";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ENV, type Env } from "../config/env";
import { AuthService } from "./auth.service";
import { OPERATOR_COOKIE, readCookie, sessionCookieOptions } from "./cookies";
import { IdentityService } from "./identity.service";

/**
 * /operator/auth/*: the operator's own sign-in (decision #25), on pd_operator only. The guard reads only that cookie for
 * /operator paths, so a clinic session never answers here, nor an operator session on a clinic route.
 */
@Controller("operator/auth")
export class OperatorAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly identity: IdentityService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(OperatorLoginInput)) input: OperatorLoginInput, @Res({ passthrough: true }) res: Response): Promise<OperatorSession> {
    const { token, session } = await this.auth.operatorLogin(input);
    res.cookie(OPERATOR_COOKIE, token, sessionCookieOptions(this.env));
    return session;
  }

  @Get("me")
  async me(): Promise<OperatorUser> {
    const { operatorId } = requireContext(); // set by the guard from a live pd_operator session
    const operator = operatorId ? await this.identity.operator(operatorId) : undefined;
    if (!operator) throw new UnauthorizedException("Sign in to the Primolar console to continue");
    return operator;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req.headers.cookie, OPERATOR_COOKIE);
    if (token) await this.auth.operatorLogout(token);
    res.clearCookie(OPERATOR_COOKIE, sessionCookieOptions(this.env));
    return {};
  }
}
