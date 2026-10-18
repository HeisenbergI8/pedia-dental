import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { SignupStatusView } from "@pedia/shared";
import type { Request } from "express";
import { SignupsService } from "./signups.service";

/**
 * The public Get started routes (billing #4, A1; B12 decision 7): no sign-in, no clinic, no operator. Prices and the
 * QR image are PlatformSettingsModule's (registered first, before `:reference`).
 */
@Controller("signups")
export class SignupsController {
  constructor(private readonly signups: SignupsService) {}

  /** Multipart: `data` (GetStartedInput), an optional `logo`, up to three `reference` images. 201. */
  @Post()
  submit(@Req() req: Request): Promise<SignupStatusView> {
    return this.signups.submit(req);
  }

  @Get(":reference")
  status(@Param("reference") reference: string): Promise<SignupStatusView> {
    return this.signups.status(reference);
  }

  /** Multipart: `data` (ReceiptUploadInput) and the receipt `file`. 201 with the refreshed status. */
  @Post(":reference/receipts")
  receipt(@Param("reference") reference: string, @Req() req: Request): Promise<SignupStatusView> {
    return this.signups.addReceipt(reference, req);
  }
}
