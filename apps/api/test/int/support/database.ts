import { type RequestContext, requestContext } from "../../../src/common/request-context";
import { loadEnv } from "../../../src/config/env";
import { PrismaService } from "../../../src/prisma/prisma.service";

/** The real, tenant-scoped client on the test database. One per file; `await prisma.onModuleDestroy()` in afterAll. */
export const testPrisma = () => new PrismaService(loadEnv({ DATABASE_URL: process.env.DATABASE_URL, LOG_LEVEL: "silent" }));

/**
 * Empties every table but Prisma's migration log, so each test starts from nothing. The schema has no foreign keys
 * (relations are ids, see CONVENTIONS), so the order doesn't matter. Raw SQL on purpose: truncation is not a model query.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ name: string }[]>`
    SELECT TABLE_NAME AS name FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  for (const { name } of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${name}\``);
}

/**
 * Runs `fn` as a request for `clinicId` would. Awaits inside the context, because Prisma queries are lazy
 * (CONVENTIONS → Traps).
 */
export const inClinic = <T>(clinicId: string, fn: () => Promise<T>, extra: Partial<RequestContext> = {}): Promise<T> =>
  requestContext.run({ requestId: `int-${clinicId}`, clinicId, operator: false, ...extra }, async () => await fn());
