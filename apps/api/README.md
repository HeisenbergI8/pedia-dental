# apps/api: Primolar backend

NestJS 12 · Prisma 7 · MySQL 8.4 · Zod 4 (schemas from `@pedia/shared`) · Vitest.

It replaces the MSW handlers in `apps/web/src/features/*/mocks.ts` one endpoint at a time. Those handlers are
the contract: same paths, same shapes, same rules.

## Run it

Requires Docker (for MySQL) plus the workspace's Node 20+ and pnpm 9.

```bash
cp apps/api/.env.example apps/api/.env   # if not present
pnpm --filter api db:up                  # MySQL on localhost:3307
pnpm dev:api                             # http://localhost:4100/api, restarts on change
curl localhost:4100/api/health           # {"status":"ok","database":"up"}
```

| Purpose | Command (from the repo root) |
| --- | --- |
| Start / stop MySQL | `pnpm --filter api db:up` / `db:down` |
| New migration after editing `prisma/schema.prisma` | `pnpm --filter api db:migrate --name <what>` |
| Apply migrations (CI, prod) | `pnpm --filter api db:deploy` |
| Regenerate the Prisma client | `pnpm --filter api db:generate` (also runs on install) |
| Tests (no database needed) | `pnpm --filter api test` |

## How it's built

Read [CONVENTIONS.md](CONVENTIONS.md) before adding an endpoint. It covers the layout, how to port a feature from
the mocks, the error contract, and the traps.
