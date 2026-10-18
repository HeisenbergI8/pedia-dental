import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { OperatorAuditService } from "./operator-audit.service";
import { OperatorAuditInterceptor } from "./operator-audited";

/** B13a (F1): the operator's audit trail; global so AuthService and the interceptor reach the service. */
@Global()
@Module({ providers: [OperatorAuditService, { provide: APP_INTERCEPTOR, useClass: OperatorAuditInterceptor }], exports: [OperatorAuditService] })
export class OperatorAuditModule {}
