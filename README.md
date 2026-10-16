# Primolar — frontend prototype

Primolar is clinic management for pediatric dental clinics, sold as a service: each clinic gets its own
account, branches, staff and branding, on a Small, Mid or Big tier. This is the clickable prototype.
All data is fake and lives in your browser.

## Run it

Requires Node 22+ and pnpm 9 (`npm i -g pnpm@9`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # if not present
pnpm dev                                       # http://localhost:3000
```

## Check it

```bash
pnpm run check      # typecheck + all tests
```

## Layout

```
apps/web/           Next.js app (the prototype)
apps/api/           NestJS + Prisma + MySQL backend (skeleton; see apps/api/README.md)
packages/shared/    Zod schemas, types and domain logic, shared with the future NestJS API
CONVENTIONS.md      How the code is organised and the rules it follows. Read before adding a feature.
apps/api/CONVENTIONS.md  The same for the backend.
ROADMAP.md          What each feature does, and the order to build them in.
DEMO_SCRIPT.md      A 5-minute walk through the demo for a client, with every login.
```

## Moving to a real backend

1. `apps/api` (NestJS + Prisma + MySQL) is scaffolded and reuses `@pedia/shared` schemas.
2. Implement the endpoints described by each `features/*/mocks.ts`.
3. Set `NEXT_PUBLIC_API_MOCKING=disabled` and point `NEXT_PUBLIC_API_URL` at the API.
