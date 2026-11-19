import { readFileSync } from "node:fs";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";
import { ENV, type Env } from "../config/env";
import { tenantScope } from "./tenant-scope";

/** Prisma's own TLS parameters in a MySQL URL (the release task's schema engine reads them too). */
const TLS_PARAMS = ["sslcert", "sslaccept"];

/**
 * #15: DATABASE_URL as the mariadb driver takes it. Without `sslcert` (local, docker-compose, tests): the URL as is.
 * With it (the deployment, packages/infra service-stack.ts): TLS, the server's certificate checked against that CA
 * bundle unless `sslaccept=accept_invalid_certs`. The driver can't read a CA path from a URL, so the URL becomes its
 * settings; any other parameter would be lost that way, so it stops start-up instead.
 */
export function databaseConfig(url: string, readFile: (path: string) => string = (path) => readFileSync(path, "utf8")) {
  const parsed = new URL(url);
  const caPath = parsed.searchParams.get("sslcert");
  if (!caPath) return url;
  const others = [...parsed.searchParams.keys()].filter((key) => !TLS_PARAMS.includes(key));
  if (others.length) throw new Error(`DATABASE_URL: with sslcert, no other parameter is supported (found ${others.join(", ")})`);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    ssl: { ca: readFile(caPath), rejectUnauthorized: parsed.searchParams.get("sslaccept") !== "accept_invalid_certs" },
  };
}

/**
 * The only database client, always tenant-scoped (src/prisma/tenant-scope.ts). Connects lazily, so the API starts
 * (and /health reports) while MySQL is down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaMariaDb(databaseConfig(env.DATABASE_URL)) });
    // Every injection gets the scoped client. A query-only extension leaves the client's types unchanged, so the
    // class still describes it; prisma.service.test.ts proves the lifecycle hook survives.
    return this.$extends(tenantScope) as this;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
