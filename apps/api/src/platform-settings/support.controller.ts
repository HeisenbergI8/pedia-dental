import { Body, Controller, Get, Param, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { SupportContactInput, SupportSettings, type ClinicSupportView, type SupportContact } from "@pedia/shared";
import { ownClinicId } from "../clinic/account-lock";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OperatorAudited } from "../operator-audit/operator-audited";
import { PlatformSettingsService } from "./platform-settings.service";

/** D12: support addresses. The operator sets them; the Owner reads the one their plan's channel uses. */
@Controller()
export class SupportController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("clinic/support")
  clinic(): Promise<ClinicSupportView> {
    return this.settings.clinicSupport(ownClinicId());
  }

  @Get("operator/support")
  support(): Promise<SupportSettings> {
    return this.settings.support();
  }

  @Put("operator/support")
  @OperatorAudited({ action: "update", record: "Support details", detail: "Support details saved", values: ({ answer }) => ({ email: (answer as SupportSettings).email, chatUrl: (answer as SupportSettings).chatUrl }) })
  saveSupport(@Body(new ZodValidationPipe(SupportSettings)) input: SupportSettings): Promise<SupportSettings> {
    return this.settings.saveSupport(input);
  }

  /** `null` before the first contact is saved, sent as JSON `null` (Nest would answer an empty body), as payment-qr does. */
  @Get("operator/accounts/:id/support-contact")
  async contact(@Param("id") id: string, @Res() res: Response): Promise<void> {
    res.json(await this.settings.supportContact(id));
  }

  @Put("operator/accounts/:id/support-contact")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Support contact saved" })
  saveContact(@Param("id") id: string, @Body(new ZodValidationPipe(SupportContactInput)) input: SupportContactInput): Promise<SupportContact> {
    return this.settings.saveSupportContact(id, input);
  }
}
