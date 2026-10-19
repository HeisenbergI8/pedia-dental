import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { RateLimitMiddleware } from "../auth/rate-limit";
import { MessageQueueModule } from "../message-queue/message-queue.module";
import { FamilyModule } from "../patients/family.module";
import { PasswordLinksController } from "./password-links.controller";
import { PortalAccessController } from "./portal-access.controller";
import { PortalJobs } from "./portal.jobs";
import { PortalService } from "./portal.service";

/**
 * B11: parents' portal accounts. Reads patients through FamilyModule only, so PatientsModule can import this one
 * (a guardian's number change moves their sign-in) without a cycle.
 */
@Module({
  imports: [AuthModule, AuditModule, FamilyModule, MessageQueueModule],
  controllers: [PortalAccessController, PasswordLinksController],
  providers: [PortalService, PortalJobs],
  exports: [PortalService],
})
export class PortalModule implements NestModule {
  /** The signed-out link routes are rate-limited per address before the guard runs, as AuthModule's /auth routes. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes(PasswordLinksController);
  }
}
