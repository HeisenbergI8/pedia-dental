# Primolar

Primolar is clinic management for pediatric dental clinics, sold as a service: each clinic gets its own
account, branches, staff and branding, on a Small, Mid or Big tier. This repository holds the web app and its API.

## Run it

Requires Node 22+ and pnpm 9 (`npm i -g pnpm@9`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # if not present
pnpm --filter api db:up                         # MySQL on localhost:3307
DEMO_LOGINS=true pnpm --filter api db:seed      # the demo clinics (a fresh database)
pnpm dev:api                                    # the API, http://localhost:4100/api
cp apps/web/.env.example apps/web/.env.local    # if not present (mocks off: NEXT_PUBLIC_API_MOCKING=disabled)
pnpm dev                                        # http://localhost:3000
```

For UI work with no API, set `NEXT_PUBLIC_API_MOCKING=enabled` in `apps/web/.env.local`: MSW then answers every
request in the browser, from the demo's fake data.

## Check it

```bash
pnpm run check      # typecheck + all tests
```

## Layout

```
apps/web/           Next.js app
apps/api/           NestJS + Prisma + MySQL backend (apps/api/README.md)
packages/shared/    Zod schemas, types and domain logic, shared by the web and the API
packages/infra/     AWS CDK: the API on AWS, its deploy workflow and runbooks (packages/infra/README.md)
CONVENTIONS.md      How the code is organised and the rules it follows. Read before adding a feature.
apps/api/CONVENTIONS.md  The same for the backend.
ROADMAP.md          What each feature does, and the order to build them in.
DEMO_SCRIPT.md      A 5-minute walk through the demo for a client, with every login.
```

## The backend

`apps/api` serves every route the web calls; the MSW handlers in `apps/web/src/mocks` and `features/*/mocks.ts` were
its contract, and each handler test is held to an API test by `apps/api/test/port-ledger.ts`. No deployment runs MSW
(`NEXT_PUBLIC_API_MOCKING=disabled`); Next's `/api` rewrite sends requests to `API_PROXY_TARGET`.
