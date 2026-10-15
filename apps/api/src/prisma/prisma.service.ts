import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";
import { ENV, type Env } from "../config/env";

/** The only database client. Connects lazily, so the API starts (and /health reports) while MySQL is down. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaMariaDb(env.DATABASE_URL) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
