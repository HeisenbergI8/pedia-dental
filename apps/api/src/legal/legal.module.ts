import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalController } from "./legal.controller";
import { PrivacyNoticeService } from "./privacy-notice.service";

/** The clinic's privacy notice (privacy #19, #20): the public notice page, and the version consents name. */
@Module({ imports: [AuditModule], controllers: [LegalController], providers: [PrivacyNoticeService], exports: [PrivacyNoticeService] })
export class LegalModule {}
