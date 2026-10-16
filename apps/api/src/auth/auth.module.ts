import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditModule } from "../audit/audit.module";
import { AccessGuard } from "./access.guard";
import { AuthController } from "./auth.controller";
import { AuthJobs } from "./auth.jobs";
import { AuthService } from "./auth.service";
import { Hasher } from "./hashing";
import { IdentityService } from "./identity.service";
import { OperatorAuthController } from "./operator-auth.controller";
import { RateLimitMiddleware, RateLimitService } from "./rate-limit";
import { SessionService } from "./session.service";

/**
 * Identity, sessions and the global access guard. `useExisting` makes APP_GUARD the AccessGuard provider itself, so
 * `overrideProvider(AccessGuard)` in a test replaces the global guard too (test/support/test-app.ts `openGuard`).
 * B2c adds the /auth and /operator/auth controllers here.
 */
@Module({
  imports: [AuditModule],
  controllers: [AuthController, OperatorAuthController],
  providers: [Hasher, SessionService, IdentityService, AuthService, RateLimitService, AuthJobs, AccessGuard, { provide: APP_GUARD, useExisting: AccessGuard }],
  exports: [Hasher, SessionService, IdentityService],
})
export class AuthModule implements NestModule {
  /** Every /auth route is rate-limited before the guard runs (CHUNKS B2). Bound by controller: no path syntax to drift. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes(AuthController, OperatorAuthController);
  }
}
