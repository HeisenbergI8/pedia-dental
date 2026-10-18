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
 * ECS stops a task with SIGTERM. Ready answers 503 for `graceMs` while every route still serves, so the load balancer
 * sees the task leave before its listener closes (a flag set only in onModuleDestroy is never seen: the server closes
 * milliseconds later). Then the app closes as enableShutdownHooks would.
 */
export async function drainThenClose(app: INestApplication, graceMs: number): Promise<void> {
  app.get(Readiness).draining = true;
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  await app.close();
}

/** Longer than two ALB health checks at a 5 s interval, well inside ECS's 30 s stop timeout (B13b sets both). */
export const SHUTDOWN_GRACE_MS = 12_000;
