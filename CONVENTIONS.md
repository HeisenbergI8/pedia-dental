# Conventions

## What this project is

A pediatric dental clinic management system. **Current phase: frontend prototype.** Every API call is
answered in the browser by MSW using fake, seeded data; there is no backend yet. A NestJS + MySQL API
(`apps/api`) will replace the mocks later, endpoint by endpoint, without changing feature code.

Users: dentists, front desk and clinic admin (staff app); parents (portal, through the demo login).

**Stack:** pnpm workspace · Next.js 15 (App Router, webpack) · React 19 · TypeScript strict · Tailwind v4 ·
TanStack Query · React Hook Form + Zod 4 · Zustand (UI state, plus the demo session in `stores/session-store.ts`) · MSW 3 · Vitest.

---

## Commands

| Purpose | Command |
| --- | --- |
| Full check (the closing gate) | `pnpm run check` |
| Fast check (runs every turn) | `pnpm run typecheck` |
| Tests, one file | `pnpm --filter <web|@pedia/shared> exec vitest run <path>` |
| Run the app locally | `pnpm dev` → http://localhost:3000 |
| Reset demo data | account menu → Reset demo data (keeps you signed in). `localStorage.clear()` then reload also works, but signs you out |

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
| Access rules | `packages/shared/src/domain/permissions.ts` | `ROLE_PERMISSIONS`: who may do what. The only place access is decided. `today.view` = Today at a glance (all staff); `dashboard.view` = finance (admin); `patients.contact` = guardian phones and emails, emergency contact and address, **left out of every patient response** without it (admin and front desk: all; a parent: their own family). Responses parse with `PatientView`; the stored record is `Patient` |
| Access gate | `apps/web/src/mocks/access.ts` | Route → permission (`RULES`), 401 / 403, parent ownership |

**Read this first:** `apps/web/src/features/patients/`. Every new feature copies its shape.

### Registering a new feature (fails silently if missed)

1. Schemas in `packages/shared/src/schemas/<name>.ts`, exported from `packages/shared/src/index.ts`.
2. Collection added to `Db` and `seed()` in `apps/web/src/mocks/`.
3. Handlers in `features/<name>/mocks.ts`, spread into `apps/web/src/mocks/handlers.ts`. A missing
   handler means the request goes to the real network and 404s.
4. Route under `app/(clinic)/…`, a `NAV` entry in `components/app-shell.tsx`, and a `ROUTE_ACCESS` entry in
   `features/auth/access.tsx` (who sees the page comes from there; a route with no entry is open in the UI).
5. Every new API route gets a rule in `RULES` in `mocks/access.ts`. Without one the gate answers 403
   (deny by default, and the body names the route). A new kind of access is a new `Permission` plus a
   `ROLE_PERMISSIONS` entry, never a role check in a component or handler.

---

## Data flow

Component → feature hook (`features/*/api.ts`) → `api(path, ZodSchema)` → `fetch(/api/...)` →
MSW handler (now) or NestJS (later).

- Never call `fetch` from a component, and never import `@/mocks/*` from feature code outside `mocks.ts`.
- Every response is parsed with a shared schema. If parsing fails, fix the mock or schema; don't loosen it.
- MSW handlers ARE the API contract. Same paths and shapes the NestJS controllers must serve.

## UI and UX

- Before changing the look, layout, flow or copy of any screen, load the `ui-ux-design` skill
  (`.claude/skills/ui-ux-design/`). It is binding for visual system, accessibility (WCAG 2.2 AA) and
  clinical-safety patterns.
- Palette, type and radius changes go in `apps/web/src/app/globals.css` tokens, never as raw values in
  components.

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
  or clear storage, or you'll keep seeing old data. The key is `pedia-dental:mock-db:v19`; each bump gets a
  one-line comment above it saying why.
- Seed shape is asserted by `mocks/seed.test.ts`. New seed patients come from `seedPatient()` after the last faker
  consumer (`seedRoster`). Adding a faker call inside `seedPatient()` re-rolls every later record, so update that
  test's first-patient names deliberately, never to make it pass.
- `describe` order in `mocks/handlers.test.ts` matters: the tests share one seeded db.
  `describe("financial dashboard")` must stay before `describe("billing")`, because its totals only hold while
  every payment is a seeded one (the `pay_seed_` guard fails loudly if moved).
- `handlers.test.ts` signs in by stubbing `document.cookie` (admin by default), because the mock reads the session
  from the `pd_session` cookie (`<img>` photo requests can't send headers). `describe("access control")` and
  `describe("parent portal")` stay last and restore admin in `afterAll`.
- PDFs (`@react-pdf/renderer`) must use Noto Sans from `apps/web/public/fonts/`. The built-in PDF fonts have no
  `₱` glyph. Keep the library behind the dynamic import in `features/documents/download.ts` so it stays out of
  page bundles.
- Documents are logged first, then the PDF is built: the server checks (issuer, source, allergy) run on the
  log request, so a refused document never produces a file.
- `@pedia/shared` ships TypeScript source (`transpilePackages`). Don't add a build step for it.
- react-big-calendar's stylesheet loads after `globals.css`, so an unscoped `.rbc-*` override silently loses.
  Scope calendar overrides under `.calendar` (the wrapper in `appointment-calendar.tsx`).
- Dark mode is `data-theme="dark"` on `<html>` (set before paint by `THEME_SCRIPT` in `app/layout.tsx`, kept in sync by
  `ThemeSync` in `app/providers.tsx`; preference per device in `stores/theme-store.ts`). `dark:` is a custom variant tied
  to that attribute and to `@media screen`, **not** the OS setting. Never add a colour that only works on white:
  `bg-white`, `text-black` and Recharts or react-big-calendar defaults all break in dark. Printing always uses the
  light tokens.
- A shared device changes person through **Switch user** (`POST /auth/switch`, own 4-digit PIN, `session.switch`),
  never a one-tap account list. It reuses `signIn(session)`, drops cached queries, and `AppShell` keys the page by
  user id, so unsaved form state is cleared. `/auth/*` is outside the access gate, so the handler checks the
  session and permission itself. PIN lockout is `pinLockout` / `PIN_POLICY` in `packages/shared/src/domain/pin.ts`.
- `lib/theme.ts` has no `"use client"`: the server `layout.tsx` imports the script string from it. Importing it from a
  `"use client"` module would give the layout a client reference, not the string.
- Validation wording: give user-facing schema fields their own message (`min(1, "Enter the child's first name")`).
  Anything unworded falls back to `plainLanguageError`, installed in `app/providers.tsx`.

---

## Reporting rules

- **A deferral is not a gap.** Deliberately deferred for the prototype: real authentication (the demo
  login is a demo control: anyone can sign in as any account with the shown password; the token is the account id; staff PINs are stored as typed and listed in the Switch user dialog's "Demo PINs" hint), the NestJS backend, real SMS/email sending, real file storage, BIR
  official receipts, and every screen that currently renders `ComingSoon`. Their absence is intentional.
- **A claim that ages carries the date it was measured.** Any count or "every / all / none" statement
  written into something durable says when it was measured.
- **Red is not automatically yours.** A failing check in code this turn did not touch is evidence about
  the tree, not a defect to fix. Establish provenance first, never by stashing.
- **A priority label is not permission to start.** Check what has been decided before planning from a label.
