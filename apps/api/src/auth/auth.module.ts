import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccessGuard } from "./access.guard";
import { Hasher } from "./hashing";
import { IdentityService } from "./identity.service";
import { SessionService } from "./session.service";

/**
 * Identity, sessions and the global access guard. `useExisting` makes APP_GUARD the AccessGuard provider itself, so
 * `overrideProvider(AccessGuard)` in a test replaces the global guard too (test/support/test-app.ts `openGuard`).
 * B2c adds the /auth and /operator/auth controllers here.
 */
@Module({
  providers: [Hasher, SessionService, IdentityService, AccessGuard, { provide: APP_GUARD, useExisting: AccessGuard }],
  exports: [Hasher, SessionService, IdentityService],
})
export class AuthModule {}
