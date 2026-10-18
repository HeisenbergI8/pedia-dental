import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Res } from "@nestjs/common";
import { ConfirmReceiptInput, RejectReceiptInput, type ReceiptToCheck } from "@pedia/shared";
import type { Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RECEIPT_NOT_FOUND, ReceiptRecordsService } from "../receipt-records/receipt-records.service";
import { SignupsService } from "../signups/signups.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";

/**
 * Payments to check (B12 decisions 6–8, 22). A receipt's payer never changes, so it is read before the transaction;
 * each decision then takes its payer's locks first, the receipt's after (E6).
 */
@Controller("operator/receipts")
export class OperatorReceiptsController {
  constructor(
    private readonly receipts: ReceiptRecordsService,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly signups: SignupsService,
  ) {}

  /** Pending only, oldest first. */
  @Get()
  pending(): Promise<ReceiptToCheck[]> {
    return this.receipts.pending();
  }

  @Get(":id/image")
  async image(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const link = await this.receipts.fileLink(id, "operator");
    if (!link) throw new NotFoundException(RECEIPT_NOT_FOUND);
    res.set("Cache-Control", "no-store").redirect(302, link);
  }

  /** Decision 22: only for the full amount due; a subscription's records the month, a sign-up's its setup fee. */
  @Post(":id/confirm")
  @HttpCode(200)
  async confirm(@Param("id") id: string, @Body(new ZodValidationPipe(ConfirmReceiptInput)) input: ConfirmReceiptInput): Promise<ReceiptToCheck> {
    const payer = await this.receipts.payer(id);
    if (payer.kind === "subscription") await this.subscriptions.confirmReceipt(payer.clinicId, id, input);
    else await this.signups.confirmReceipt(payer.signupId, id, input);
    return this.receipts.toCheck(id);
  }

  @Post(":id/reject")
  @HttpCode(200)
  async reject(@Param("id") id: string, @Body(new ZodValidationPipe(RejectReceiptInput)) { reason }: RejectReceiptInput): Promise<ReceiptToCheck> {
    const payer = await this.receipts.payer(id);
    if (payer.kind === "subscription") await this.subscriptions.rejectReceipt(payer.clinicId, id, reason);
    else await this.signups.rejectReceipt(payer.signupId, id, reason);
    return this.receipts.toCheck(id);
  }
}
