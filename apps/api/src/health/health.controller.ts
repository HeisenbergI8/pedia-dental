import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Readiness } from "./readiness";

/** The load balancer's probe must not wait for the driver's ~30 s connect timeout (API CONVENTIONS → Traps). */
export const READY_TIMEOUT_MS = 2_000;

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readiness: Readiness,
  ) {}

  /** Liveness: the process answers. Never touches the database (the container health check, B13a E5). */
  @Get("live")
  live() {
    return { status: "ok" } as const;
  }

  /** Readiness: serving and the database answers within READY_TIMEOUT_MS (the ALB's target health check). */
  @Get("ready")
  ready() {
    return this.check();
  }

  /** Kept for existing callers (tests, e2e start-up): the same answer as ready. */
  @Get()
  async check() {
    if (this.readiness.draining) throw new ServiceUnavailableException("Shutting down.");
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), READY_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } catch {
      throw new ServiceUnavailableException("The database is unreachable.");
    } finally {
      clearTimeout(timer);
    }
    return { status: "ok", database: "up" } as const;
  }
}
