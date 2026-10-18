import { Controller, Get, NotFoundException, Param, Post, Req, Res } from "@nestjs/common";
import type { SubscriptionView } from "@pedia/shared";
import type { Request, Response } from "express";
import { ownClinicId } from "../clinic/account-lock";
import { RECEIPT_NOT_FOUND, ReceiptRecordsService } from "../receipt-records/receipt-records.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";

/** The Owner's Primolar bill (billing #31, B12 decisions 6, 21, 24): clinic.manage only (access-rules.ts). */
@Controller("clinic/subscription")
export class ClinicBillingController {
  constructor(
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly receipts: ReceiptRecordsService,
  ) {}

  @Get()
  view(): Promise<SubscriptionView> {
    return this.subscriptions.view(ownClinicId());
  }

  /** Multipart: `data` (ReceiptUploadInput) and the receipt `file`. 201 with the refreshed subscription. */
  @Post("receipts")
  receipt(@Req() req: Request): Promise<SubscriptionView> {
    return this.subscriptions.addReceipt(ownClinicId(), req);
  }

  /** Decision 24: this clinic's own receipts only; anything else reads as missing. A 302 to a 5-minute link. */
  @Get("receipts/:id/image")
  async image(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const link = await this.receipts.fileLink(id, { clinicId: ownClinicId() });
    if (!link) throw new NotFoundException(RECEIPT_NOT_FOUND);
    res.set("Cache-Control", "no-store").redirect(302, link);
  }
}
