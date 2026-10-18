# apps/api: Primolar backend

NestJS 12 · Prisma 7 · MySQL 8.4 · Zod 4 (schemas from `@pedia/shared`) · Vitest.

It replaces the MSW handlers in `apps/web/src/features/*/mocks.ts` one endpoint at a time. Those handlers are
the contract: same paths, same shapes, same rules.

## Run it

Requires Docker (for MySQL) plus the workspace's Node 22+ and pnpm 9.

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

## Production build and image (B13a)

1. **The bundle without Docker:** `pnpm --filter api build && pnpm --filter api start:prod`, with `.env` or real
   variables. `build.mjs` writes `dist/main.mjs`, which resolves its npm packages from `apps/api/node_modules`, so run
   it from here.
2. **Build the image** from the repository root: `docker build -f apps/api/Dockerfile -t primolar-api .`
3. **Run the release step** against the local MySQL:
   `docker run --rm --network host -e DATABASE_URL=mysql://pedia:pedia@127.0.0.1:3307/pedia_dental primolar-api node_modules/.bin/prisma migrate deploy`
4. **Serve:** `docker run --rm --network host -e DATABASE_URL=… -e COOKIE_SECURE=false primolar-api`, then
   `curl -fsS localhost:4100/api/health/ready`.

The container's health check calls `GET /api/health/live`, which never touches the database. The load balancer calls
`GET /api/health/ready`, which checks the database with a 2-second limit and answers 503 while the task shuts down.

A hosted deployment (B13b) sets these variables:

| Variable | Source | Value |
| --- | --- | --- |
| `DATABASE_URL` | secret store | the RDS connection |
| `SEMAPHORE_API_KEY` | secret store | once Semaphore approves the account |
| `APP_ENV` | plain | `production`, or `demo` for the hosted demo |
| `CORS_ORIGIN` | plain | the web's https origins, comma-separated |
| `WEB_URL` | plain | the web's https address |
| `S3_BUCKET`, `S3_REGION` | plain | the files bucket, `ap-southeast-1` |
| `TRUST_PROXY_HOPS` | plain | measured behind Vercel → ALB (B13b, Q3) |
| `METRICS_INTERVAL_S` | plain | `60` |
| `BACKGROUND_WORK` | plain | `true` on exactly one task, `false` on the rest |
| `DEMO_LOGINS` | plain | only with `APP_ENV=demo` |

`STORAGE_LINK_SECRET` is unused with S3.

## How it's built

Read [CONVENTIONS.md](CONVENTIONS.md) before adding an endpoint. It covers the layout, how to port a feature from
the mocks, the error contract, and the traps.
