import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { SupportContact, SupportSettings, type ClinicSupportView } from "@pedia/shared";
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

  @Get("operator/accounts/:id/support-contact")
  contact(@Param("id") id: string): Promise<SupportContact | null> {
    return this.settings.supportContact(id);
  }

  @Put("operator/accounts/:id/support-contact")
  @OperatorAudited({ action: "update", record: "Clinic account", detail: "Support contact saved" })
  saveContact(@Param("id") id: string, @Body(new ZodValidationPipe(SupportContact)) input: SupportContact): Promise<SupportContact> {
    return this.settings.saveSupportContact(id, input);
  }
}
