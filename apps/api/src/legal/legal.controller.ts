import { Controller, Get, Param } from "@nestjs/common";
import { PrivacyNoticeService } from "./privacy-notice.service";

/** features/legal/mocks.ts: public, before sign-in (PUBLIC_RULES in access-rules.ts). Reads one clinic's notice only. */
@Controller()
export class LegalController {
  constructor(private readonly notices: PrivacyNoticeService) {}

  @Get("legal/notices/:clinicId")
  notice(@Param("clinicId") clinicId: string) {
    return this.notices.publicView(clinicId);
  }
}
