import { Injectable, type OnModuleDestroy } from "@nestjs/common";

/** Set once shutdown begins (SIGTERM through enableShutdownHooks): ready answers 503 so no new request is routed here. */
@Injectable()
export class Readiness implements OnModuleDestroy {
  draining = false;
  onModuleDestroy() {
    this.draining = true;
  }
}
