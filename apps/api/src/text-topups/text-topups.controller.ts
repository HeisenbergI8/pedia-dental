import { Controller, Get, Post, Req } from "@nestjs/common";
import type { TextTopUpsView } from "@pedia/shared";
import type { Request } from "express";
import { ownClinicId } from "../clinic/account-lock";
import { TextTopUpsService } from "./text-topups.service";

/** Feature 16 (revised): the Owner's text top-ups on Settings → Plan: clinic.manage only (access-rules.ts). */
@Controller("clinic/text-topups")
export class TextTopUpsController {
  constructor(private readonly topUps: TextTopUpsService) {}

  @Get()
  view(): Promise<TextTopUpsView> {
    return this.topUps.view(ownClinicId());
  }

  /** Multipart: `data` (TextTopUpInput) and the receipt `file`. 201 with the refreshed top-ups. The image is served by
   * GET /clinic/subscription/receipts/:id/image, which serves the clinic's own top-up receipts too. */
  @Post("receipts")
  receipt(@Req() req: Request): Promise<TextTopUpsView> {
    return this.topUps.addReceipt(ownClinicId(), req);
  }
}
