import { type INestApplication, Injectable, type OnModuleDestroy } from "@nestjs/common";

/** Set once shutdown begins (SIGTERM through enableShutdownHooks): ready answers 503 so no new request is routed here. */
@Injectable()
export class Readiness implements OnModuleDestroy {
  draining = false;
  onModuleDestroy() {
    this.draining = true;
  }
}

/**
 * The platform stops the app with SIGTERM. Ready answers 503 for `graceMs` while every route still serves, so a load
 * balancer sees the instance leave before its listener closes (a flag set only in onModuleDestroy is never seen: the
 * server closes milliseconds later). Then the app closes as enableShutdownHooks would. Cloud Run stops routing before
 * SIGTERM, so it needs only a short grace (env SHUTDOWN_GRACE_MS).
 */
export async function drainThenClose(app: INestApplication, graceMs: number): Promise<void> {
  app.get(Readiness).draining = true;
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  await app.close();
}

/** The default of env SHUTDOWN_GRACE_MS: longer than two load-balancer health checks at a 5 s interval. */
export const SHUTDOWN_GRACE_MS = 12_000;
