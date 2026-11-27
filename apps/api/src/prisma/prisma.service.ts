import { readFileSync } from "node:fs";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.ts";
import { ENV, type Env } from "../config/env";
import { tenantScope } from "./tenant-scope";

/** Prisma's own TLS parameters in a MySQL URL (the release job's schema engine reads them too). */
const TLS_PARAMS = ["sslcert", "sslaccept"];
/** Prisma's socket parameter: Cloud Run reaches Cloud SQL through /cloudsql/<connection name> (packages/infra run.tf). */
const SOCKET_PARAM = "socket";

/**
 * DATABASE_URL as the mariadb driver takes it. Without `socket` or `sslcert` (local, docker-compose, tests): the URL
 * as is. With `socket` (Cloud Run): the driver's socketPath; the Cloud SQL connector encrypts the connection, so no
 * TLS settings. With `sslcert` (#15, a TLS connection over the network): the server's certificate checked against
 * that CA bundle unless `sslaccept=accept_invalid_certs`. The driver reads neither from a URL, so the URL becomes its
 * settings; any other parameter would be lost that way, so it stops start-up instead.
 */
export function databaseConfig(url: string, readFile: (path: string) => string = (path) => readFileSync(path, "utf8")) {
  const parsed = new URL(url);
  const socketPath = parsed.searchParams.get(SOCKET_PARAM);
  const caPath = parsed.searchParams.get("sslcert");
  if (!socketPath && !caPath) return url;
  const known = socketPath ? [SOCKET_PARAM] : TLS_PARAMS;
  const others = [...parsed.searchParams.keys()].filter((key) => !known.includes(key));
  if (others.length) throw new Error(`DATABASE_URL: with ${socketPath ? SOCKET_PARAM : "sslcert"}, no other parameter is supported (found ${others.join(", ")})`);
  const credentials = {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
  if (socketPath) return { socketPath, ...credentials };
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    ...credentials,
    ssl: { ca: readFile(caPath!), rejectUnauthorized: parsed.searchParams.get("sslaccept") !== "accept_invalid_certs" },
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
