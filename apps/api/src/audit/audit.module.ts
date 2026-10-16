import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/** Import it in any feature that reads patient records or performs a privileged action. */
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
