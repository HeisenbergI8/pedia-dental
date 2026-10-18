import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from "@nestjs/common";
import { RecordUpfrontPaymentInput, RejectSignupInput, type CreateAccountResult, type Signup } from "@pedia/shared";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SignupsService } from "../signups/signups.service";
import { AccountOverviewService } from "./account-overview";

/** The console's sign-ups (billing #12–#15): Primolar's own records, never a clinic's. */
@Controller("operator/signups")
export class OperatorSignupsController {
  constructor(
    private readonly signups: SignupsService,
    private readonly overviews: AccountOverviewService,
  ) {}

  @Get()
  list(): Promise<Signup[]> {
    return this.signups.list();
  }

  /** The logo or a reference image: a 302 to a 5-minute link, only for a key this sign-up holds. */
  @Get(":id/files/:key")
  async file(@Param("id") id: string, @Param("key") key: string, @Res() res: Response): Promise<void> {
    res.set("Cache-Control", "no-store").redirect(302, await this.signups.fileLink(id, key));
  }

  /** Multipart, as POST /signups (SignupInput). */
  @Put(":id")
  fix(@Param("id") id: string, @Req() req: Request): Promise<Signup> {
    return this.signups.fix(id, req);
  }

  @Post(":id/payment")
  @HttpCode(200)
  payment(@Param("id") id: string, @Body(new ZodValidationPipe(RecordUpfrontPaymentInput)) input: RecordUpfrontPaymentInput): Promise<Signup> {
    return this.signups.recordPayment(id, input);
  }

  @Post(":id/reject")
  @HttpCode(200)
  reject(@Param("id") id: string, @Body(new ZodValidationPipe(RejectSignupInput)) { reason }: RejectSignupInput): Promise<Signup> {
    return this.signups.reject(id, reason);
  }

  /** 201: the clinic, its row for the console, and the Owner's temporary password and PIN, sent this once (#21). */
  @Post(":id/approve")
  async approve(@Param("id") id: string): Promise<CreateAccountResult> {
    const made = await this.signups.approve(id);
    return { overview: (await this.overviews.of([made.clinicId]))[0]!, temporaryPassword: made.temporaryPassword, pin: made.pin };
  }
}
