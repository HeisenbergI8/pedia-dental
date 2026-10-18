import { Controller, Get, HttpCode, NotFoundException, Put, Req, Res } from "@nestjs/common";
import type { PaymentQrView } from "@pedia/shared";
import type { Request, Response } from "express";
import { NO_QR_IMAGE, PlatformSettingsService } from "./platform-settings.service";
import { OperatorAudited } from "../operator-audit/operator-audited";

/** Primolar's payment QR (B12 decisions 5, 23). The image is public: a payment QR is meant to be shared. */
@Controller()
export class PaymentQrController {
  constructor(private readonly settings: PlatformSettingsService) {}

  /** `null` before the first upload, sent as JSON `null` (Nest would answer an empty body). */
  @Get("operator/payment-qr")
  async qr(@Res() res: Response): Promise<void> {
    res.json(await this.settings.qr());
  }

  /** Multipart `data` (PaymentQrInput) and an optional `file`. */
  @Put("operator/payment-qr")
  @OperatorAudited({ action: "update", record: "Payment QR", detail: "Payment QR saved" })
  @HttpCode(200)
  save(@Req() req: Request): Promise<PaymentQrView> {
    return this.settings.saveQr(req);
  }

  /** Registered before /signups/:reference (SignupsController is imported after this module). */
  @Get("signups/payment-qr/image")
  async image(@Res() res: Response): Promise<void> {
    const link = await this.settings.qrLink();
    if (!link) throw new NotFoundException(NO_QR_IMAGE);
    res.set("Cache-Control", "no-store").redirect(302, link);
  }
}
