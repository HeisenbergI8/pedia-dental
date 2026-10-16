import { Module } from "@nestjs/common";
import { PrivacyNoticeService } from "./privacy-notice.service";

/** The clinic's privacy notice (privacy #19, #20). */
@Module({ providers: [PrivacyNoticeService], exports: [PrivacyNoticeService] })
export class LegalModule {}
