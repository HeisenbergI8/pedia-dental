import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";
import { ENV, type Env } from "../config/env";
import { tenantScope } from "./tenant-scope";

/**
 * The only database client, always tenant-scoped (src/prisma/tenant-scope.ts). Connects lazily, so the API starts
 * (and /health reports) while MySQL is down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
    // Every injection gets the scoped client. A query-only extension leaves the client's types unchanged, so the
    // class still describes it; prisma.service.test.ts proves the lifecycle hook survives.
    return this.$extends(tenantScope) as this;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
