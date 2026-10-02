# Conventions

## What this project is

A pediatric dental clinic management system. **Current phase: frontend prototype.** Every API call is
answered in the browser by MSW using fake, seeded data; there is no backend yet. A NestJS + MySQL API
(`apps/api`) will replace the mocks later, endpoint by endpoint, without changing feature code.

Users: dentists, front desk and clinic admin (staff app); parents (portal, later).

**Stack:** pnpm workspace · Next.js 15 (App Router, webpack) · React 19 · TypeScript strict · Tailwind v4 ·
TanStack Query · React Hook Form + Zod 4 · Zustand (UI state only) · MSW 3 · Vitest.

---

## Commands

| Purpose | Command |
| --- | --- |
| Full check (the closing gate) | `pnpm run check` |
| Fast check (runs every turn) | `pnpm run typecheck` |
| Tests, one file | `pnpm --filter <web|@pedia/shared> exec vitest run <path>` |
| Run the app locally | `pnpm dev` → http://localhost:3000 |
| Reset demo data | browser console: `localStorage.clear()` then reload |

---

## Where things live

| Layer | Path | Owns |
| --- | --- | --- |
| Shared contract | `packages/shared/src/schemas/` | Zod schemas + types. Used by web now and by NestJS later |
| Domain logic | `packages/shared/src/domain/` | Pure functions: FDI teeth, chart derivation, money, follow-up rules. Unit-tested |
| Routes | `apps/web/src/app/` | Thin pages only. `(clinic)` = staff app, `(portal)` = parent portal |
| Features | `apps/web/src/features/<name>/` | `api.ts` (Query hooks), `mocks.ts` (MSW handlers), `components/` |
| Fake backend | `apps/web/src/mocks/` | MSW setup, localStorage-backed `db`, deterministic `seed` |
| HTTP | `apps/web/src/lib/api-client.ts` | The only `fetch` in the app |

**Read this first:** `apps/web/src/features/patients/`. Every new feature copies its shape.

### Registering a new feature (fails silently if missed)

1. Schemas in `packages/shared/src/schemas/<name>.ts`, exported from `packages/shared/src/index.ts`.
2. Collection added to `Db` and `seed()` in `apps/web/src/mocks/`.
3. Handlers in `features/<name>/mocks.ts`, spread into `apps/web/src/mocks/handlers.ts`. A missing
   handler means the request goes to the real network and 404s.
4. Route under `app/(clinic)/…`, and a `NAV` entry in `components/app-shell.tsx` with its roles.

---

## Data flow

Component → feature hook (`features/*/api.ts`) → `api(path, ZodSchema)` → `fetch(/api/...)` →
MSW handler (now) or NestJS (later).

- Never call `fetch` from a component, and never import `@/mocks/*` from feature code outside `mocks.ts`.
- Every response is parsed with a shared schema. If parsing fails, fix the mock or schema; don't loosen it.
- MSW handlers ARE the API contract. Same paths and shapes the NestJS controllers must serve.

## Domain rules

- Teeth use FDI numbering (11–48 permanent, 51–85 primary). Use `domain/teeth.ts`, never hard-code lists.
- Chart entries and payments are append-only. Corrections are new rows (`supersedes`), never edits.
- Money is integer centavos everywhere. Format only at display time with `formatPeso`.
- Balances are computed from payments, never stored.
- Follow-up and recall intervals are data (`DEFAULT_FOLLOW_UP_RULES`), not `if` statements.
- Every record carries `clinicId` (multi-clinic later).
- Allergies and alerts must be visible on every patient screen (`PatientHeader`).

---

## Traps

- MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. Older MSW docs and examples are wrong here.
- `msw/browser` has no server build. `next.config.ts` aliases it to `false` on the server; keep that,
  and only import `@/mocks/browser` dynamically from `app/providers.tsx`.
- `NEXT_PUBLIC_*` env vars are inlined at build time. Changing `.env.local` needs a dev-server restart.
- Mock data lives in `localStorage`. After changing `seed()` or `Db`, bump the key in `mocks/db.ts`
  or clear storage, or you'll keep seeing old data.
- `@pedia/shared` ships TypeScript source (`transpilePackages`). Don't add a build step for it.

---

## Reporting rules

- **A deferral is not a gap.** Deliberately deferred for the prototype: real authentication (the role
  switcher is a demo control), the NestJS backend, real SMS/email sending, real file storage, BIR
  official receipts, and every screen that currently renders `ComingSoon`. Their absence is intentional.
- **A claim that ages carries the date it was measured.** Any count or "every / all / none" statement
  written into something durable says when it was measured.
- **Red is not automatically yours.** A failing check in code this turn did not touch is evidence about
  the tree, not a defect to fix. Establish provenance first, never by stashing.
- **A priority label is not permission to start.** Check what has been decided before planning from a label.
