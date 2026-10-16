# Conventions

## What this project is

Primolar: pediatric dental clinic management sold as a service to many clinics. Each paying clinic is a
**clinic account** with its own branches, staff, patients and branding (ROADMAP feature 16). **Current phase: frontend prototype.** In the demo every API call is
answered in the browser by MSW using fake, seeded data; in `hybrid` mode the routes apps/api already serves (B2: sign-in) go to it. A NestJS + MySQL API
(`apps/api`, scaffolded; its own rules are in `apps/api/CONVENTIONS.md`) will replace the mocks later, endpoint by endpoint, without changing feature code. A clinic joins through
the public **Get started** form, and Primolar approves it in the operator console (ROADMAP feature 17). Each clinic
then pays Primolar monthly; the operator records payments by hand, and a clinic 7 days overdue pauses itself.

Users: the Primolar operator (operator console); in each clinic account, the Owner, admins, dentists and front
desk (staff app); parents (portal, through the demo login).

**Stack:** pnpm workspace · Next.js 15 (App Router, webpack) · React 19 · TypeScript strict · Tailwind v4 ·
TanStack Query · React Hook Form + Zod 4 · Zustand (UI state, plus the demo session in `stores/session-store.ts`) · MSW 3 · Vitest.

---

## Commands

| Purpose | Command |
| --- | --- |
| Full check (the closing gate) | `pnpm run check` |
| Fast check (runs every turn) | `pnpm run typecheck` |
| Tests, one file | `pnpm --filter <web|@pedia/shared|@pedia/seed> exec vitest run <path>` |
| Design guards (contrast, tokens, shell, screens) | `pnpm run check -- design` (typecheck + every `src/design/design-*.test.ts`) |
| Run the app locally | `pnpm dev` → http://localhost:3000 |
| Run against the real API | `NEXT_PUBLIC_API_MOCKING=hybrid API_PROXY_TARGET=http://localhost:4100 pnpm dev` with `pnpm dev:api` running (`DEMO_LOGINS=true COOKIE_SECURE=false`, seeded with `pnpm --filter api db:seed`). `enabled` = MSW answers everything (the demo); `hybrid` = MSW answers all but `API_ROUTES` (`mocks/passthrough.ts`: since B2, sign-in, `/operator/auth/*` and `GET /clinic|/branches|/staff`), which go through Next's `/api` proxy to the API; `disabled`/unset = no MSW |
| Sign-in against the API, end to end | Both servers on free ports (the web on its own `NEXT_DIST_DIR=.next-hybrid`), then in `apps/web`: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-sign-in.spec.ts --project=desktop`. Start-up commands: the B2d plan, Step 4.1. It signs in 10 times; the API allows 20 sign-ins per 5 minutes per address |
| Reset demo data | account menu → Reset demo data (keeps you signed in). `localStorage.clear()` then reload also works, but signs you out |

---

## Where things live

| Layer | Path | Owns |
| --- | --- | --- |
| Shared contract | `packages/shared/src/schemas/` | Zod schemas + types. Used by web now and by NestJS later |
| Domain logic | `packages/shared/src/domain/` | Pure functions: FDI teeth, chart derivation, money, follow-up rules. Unit-tested |
| Routes | `apps/web/src/app/` | Thin pages only. `(clinic)` = staff app, `(portal)` = parent portal |
| Features | `apps/web/src/features/<name>/` | `api.ts` (Query hooks), `mocks.ts` (MSW handlers), `components/` |
| Fake backend | `apps/web/src/mocks/` | MSW setup, localStorage-backed `db`, the access gate, the passthrough list (`passthrough.ts`) |
| Demo seed | `packages/seed/` (`@pedia/seed`) | The deterministic demo data (`seedPlatform`, `Db`, `Platform`) and who signs in with which email (`logins.ts`). Shared by MSW and the API's `prisma db seed`; demo data only |
| HTTP | `apps/web/src/lib/api-client.ts` | The only `fetch` in the app |
| Access rules | `packages/shared/src/domain/permissions.ts` | `ROLE_PERMISSIONS`: who may do what. The only place access is decided. `branches.all` = works at every branch (Owner). `today.view` = Today at a glance (all staff); `dashboard.view` = finance (admin); `patients.contact` = guardian phones and emails, emergency contact and address, **left out of every patient response** without it (admin and front desk: all; a parent: their own family). Responses parse with `PatientView`; the stored record is `Patient` |
| Access gate | `apps/web/src/mocks/access.ts` | Route → permission (`RULES`), 401 / 403, parent ownership. `/operator/*` branches off before `sessionOf` (`operatorRefusal`); `/signups/*` and `/legal/*` too (`publicRefusal`, deny-by-default `PUBLIC_RULES`) |
| Operator console | `apps/web/src/features/operator/`, `apps/web/src/app/operator/` | Primolar's console: clinic accounts, tiers, Owners, usage counts; sign-ups (record payment, fix, reject, approve), the price list, Set branding for Design it for me clinics; each clinic's subscription (record a month's payment, cancel). Its own sign-in, session store and routes; never a clinic user |
| Public sign-up | `apps/web/src/features/signup/`, `apps/web/src/app/get-started/` | Get started form and the status page by reference. No sign-in; `/signups/*` answered outside every clinic |

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

- Never call `fetch` from a component, and never import `@/mocks/*` from feature code outside `mocks.ts` (or a feature's second handler file, `*-mocks.ts`).
- Every response is parsed with a shared schema. If parsing fails, fix the mock or schema; don't loosen it.
- MSW handlers ARE the API contract. Same paths and shapes the NestJS controllers must serve.

## UI and UX

- Before changing the look, layout, flow or copy of any screen, load the `ui-ux-design` skill
  (`.claude/skills/ui-ux-design/`). It is binding for visual system, accessibility (WCAG 2.2 AA) and
  clinical-safety patterns.
- Palette, type and radius changes go in `apps/web/src/app/globals.css` tokens, never as raw values in
  components.
- `apps/web/src/design/` holds guards that read source and render primitives: token contrast in both themes, no raw
  hex outside `globals.css` / `manifest.ts` / `document-pdf.tsx` (the seed's stored brand colours live in
  `packages/seed`, outside the guard), no dashed outlines, crayon strip and Fredoka only on login and portal, Primolar's logo only on the sign-in pages, the operator console and the public sign-up frame
  (`design-branding.test.ts`). A failing guard means the system was bypassed. Fix the component, not the guard.
- Tailwind v4's bare `border` is `currentColor`. `globals.css` restores `line` as the default, so a darker edge is
  always named (`border-input`, `border-alert-line`).

## Domain rules

- Teeth use FDI numbering (11–48 permanent, 51–85 primary). Use `domain/teeth.ts`, never hard-code lists.
- Chart entries and payments are append-only. Corrections are new rows (`supersedes`), never edits.
- Money is integer centavos everywhere. Format only at display time with `formatPeso`.
- Balances are computed from payments, never stored.
- Follow-up and recall intervals are data (`DEFAULT_FOLLOW_UP_RULES`), not `if` statements.
- Every record belongs to one clinic account (`clinicId`), and branch-level records (appointments, chairs,
  invoices, payments) also to one branch (`branchId`). Mock handlers scope every read and write to the
  signed-in account; no account ever sees another's data, and the operator never sees patient records.
- The clinic's name, hours, address and branding come from its account and branch, never from constants.
- Tier limits are data, not `if` statements, and are enforced in the handler as well as the UI.
- A clinic's brand colour is checked and derived in `domain/branding.ts` (`brandColorProblem`, `deriveBrandPalette`)
  and applied only by `brandCss` (`features/clinic/brand-css.ts`). Never colour a component from
  `account.brandColor`; use the brand tokens. Two exceptions, both because CSS variables can't reach them: the PDF
  letterhead's ring (react-pdf) and a colour not yet any account's: the preview and swatches in
  `features/clinic/components/brand-fields.tsx` and the console's sign-up Look card. The clinic's logo comes from `ClinicContext.logoUrl` through
  `ClinicLogo`. Primolar's wordmark appears only on sign-in, the operator console, the cold-start loader and
  `PoweredByPrimolar`, plus the public sign-up frame.
- The heading font is on every plan (billing #8). The operator sets a clinic's look only for Design it for me
  (`PUT /operator/accounts/:id/branding`); every other look is the Owner's, in Settings → Clinic → Look.
- Sign-up money: prices are VAT-inclusive centavos in `Platform.prices`. A sign-up's amount due is `amountDue`
  (`domain/signup.ts`), quoted at submission and kept on the sign-up; the VAT part is `vatPart`. Duplicate clinic names
  use `sameClinicName` everywhere.
- Subscriptions (billing #25–#30): one per clinic in `Platform.subscriptions`. Due dates come only from
  `subscriptionDueOn(anchor, paidMonths)` and every state from `subscriptionStatus` (`domain/subscription.ts`); a payment
  moves the schedule by one month, never by the date paid. The mock's "today" is `today()` (`mocks/clock.ts`); never
  `new Date()` for billing. Due dates are settled lazily by `settleSubscriptions()` at the top of the access gate:
  downgrades apply on their date, and a lapsed or ended subscription pauses an active clinic with the existing pause,
  recording why (`pause`), so a payment lifts only its own pause (and settle lifts it if the demo clock moves back).
  Each month is billed at the plan in force when it began: a plan change made while overdue keeps the running
  month's price (`priceTier`) and a downgrade waits for the next due date after today. Billing is the Owner's (`GET /clinic/subscription`,
  `clinic.manage`). Primolar invoices are `DocContent` with Primolar's letterhead (`features/clinic/primolar-invoice.ts`).
- Privacy (feature 18): the templates and their versions are `LEGAL_DOCUMENTS` (`domain/legal.ts`), labelled
  `PENDING_REVIEW` until a lawyer reviews them. A clinic's agreements are append-only in `Platform.agreements`;
  `termsOutdated` decides when the Owner must accept again. The gate blocks the Owner (terms) and a staff login
  (confidentiality) through `SessionUser.mustAcknowledge`; a parent's notice is a portal step, not a gate. `POST /patients`
  takes `RegisterPatientInput`, which requires the parent's consent. Optional consents are enforced only on an explicit
  "no" (`choiceDeclined`): intraoral and extraoral uploads, and every message through `queueMessage`. A clinic's notice is
  versioned in `Db.privacyNotices`.
- Branch-level reports (Today, finance, daily collections) take `?branch=` (a branch id or `all`), resolved only by
  `reportBranches(request)`. Who may ask for what is `reportBranchFilter` in `domain/tenancy.ts`: Mid and Big, two or
  more branches; `all` for the Owner.
- Allergies and alerts must be visible on every patient screen (`PatientHeader`).

---

## Traps

- MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. Older MSW docs and examples are wrong here.
- `msw/browser` has no server build. `next.config.ts` aliases it to `false` on the server; keep that,
  and only import `@/mocks/browser` dynamically from `app/providers.tsx`.
- `NEXT_PUBLIC_*` env vars are inlined at build time. Changing `.env.local` needs a dev-server restart.
- Mock data lives in `localStorage`. After changing `seed()` or `Db`, bump the key in `mocks/db.ts`
  or clear storage, or you'll keep seeing old data. The key is `pedia-dental:mock-db:v28`; each bump gets a
  one-line comment above it saying why.
- The mock store is partitioned by clinic account: `Platform = { accounts, tenants, signups, prices, subscriptions, agreements }`
  in `mocks/db.ts`. Sign-ups, prices, subscriptions and agreements are Primolar's, never inside a tenant. `db` is a
  live binding to the signed-in account's `Db`, repointed by `sessionOf()` (`selectTenant`). Never cache `db` in a
  module-level variable, and never call `selectTenant` from a feature handler. Stamp new records with
  `currentClinicId()`. Branch-level lists filter by `activeBranch(request)` (from the `pd_branch` cookie, validated).
- A test that signs in with a login created in the test (staff the Owner adds, a new clinic's Owner) must `POST
  /auth/acknowledgement` for confidentiality after the password step. Seeded staff have acknowledged already.
- Session cookies by mode, decided only in `lib/session-cookies.ts`. `enabled`: the stores write `pd_session` /
  `pd_operator` with the mock's token. `hybrid`: those are the API's httpOnly cookies (script can neither read nor
  write them), so the stores write the non-secret bridge `pd_mock_session` / `pd_mock_operator` (the mock token for
  the same login) and MSW reads only that. `disabled`: no session cookie from script. `pd_branch` is script-written in
  every mode and validated by both sides. The body's `token` is `"cookie"` from the API and is never read in `hybrid`.
- In `hybrid`, the clinic reads come from MySQL but `PUT /clinic`, branch and staff writes still go to MSW's
  localStorage (until B3). An Owner's settings edit there succeeds and never shows. MSW's and the API's data are
  seeded from the same `@pedia/seed`; resetting one doesn't reset the other.
- `next dev` with a custom `NEXT_DIST_DIR` rewrites `apps/web/tsconfig.json` (adds that dir's types). Revert it
  (`git checkout -- apps/web/tsconfig.json`); never commit it.
- Demo tokens are `demo.<clinicId>.<accountId>`. Handler tests sign in with `pd_session=demo.clinic_demo.<id>`, and
  add `; pd_branch=<branch id>` to pick a branch. Cross-account tests live in `mocks/tenancy.test.ts`, not `handlers.test.ts`.
- Opening hours are the branch's (`useActiveBranch().openingHours`, `Branch.openingHours` in mocks). The clinic name
  is the account's (`useClinic().account.name`, `currentAccount().name`). Every hours function takes `hours`.
- A session holds every role (`SessionUser.roles`, e.g. Admin + Dentist). Check access with `rolesCan(roles, …)` /
  `permissionScopeFor`, and "is a dentist" with `holdsRole(staff, "dentist")`. `roleCan(session.role, …)` and
  `s.role === "dentist"` still compile but ignore a second role.
- Staff logins the Owner adds have their own password in `Db.staffCredentials` (stored as typed, like PINs); seeded
  logins have none and use the demo password. A deactivated login (`deactivatedAt`) is dropped by `allAccounts`, so
  it can't sign in, switch in or be picked, and `worksAt` refuses it. Name lookups still use the full `db.staff`.
  `GET /staff` serves `email` to the Owner only and `deactivatedAt` to staff only. An email is one login per account,
  deactivated logins included (`emailTaken`).
  Owner-settings tests live in `mocks/owner-settings.test.ts`, since they change tiers, staff and branches.
- The operator is not a clinic user: token `operator.<id>`, cookie `pd_operator`, routes `/operator/*`, store
  `stores/operator-session-store.ts`. Operator handlers read `platform.tenants[id]` and never touch `db`,
  `selectTenant` or `sessionOf` (guarded in `mocks/operator.test.ts`, which also sends the operator token to every
  clinic route). Operator query keys start with `"operator"`: the global 401 handler in `app/providers.tsx` signs out
  the operator, not the clinic user, on that prefix. Operator tests live in `mocks/operator.test.ts`, cross-branch
  report tests in `mocks/cross-branch.test.ts`. The same guard reads `features/operator/signup-mocks.ts`,
  `features/signup/mocks.ts`, `features/legal/mocks.ts`, `mocks/signups.ts` and `mocks/subscriptions.ts`: public,
  sign-up, legal and subscription code works on `platform` alone. Tests that move the clock (`setToday`) live only in `mocks/subscriptions.test.ts`: a moved
  clock pauses seeded clinics for every later test in that file. To show grace or the pause in the browser, set
  `localStorage["pedia-dental:demo-today"]` to a `yyyy-MM-dd` date and reload; remove it to go back. Sign-up
  tests live in `mocks/signups.test.ts` (public) and `mocks/operator-signups.test.ts` (console); the latter's
  price-list describe changes `platform.prices` and stays last.
- A sign-up's files travel as multipart parts beside a `data` JSON part, built only by `signupFormData`
  (`features/signup/form-data.ts`) and read only by `readSignupForm` (`mocks/signups.ts`). New clinics are made only
  by `createClinic` (approve and direct creation share it).
- Seed shape is asserted by `packages/seed/src/seed.test.ts`. New seed patients come from `seedPatient()` after the last faker
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
  login is a demo control: anyone can sign in as any account with the shown password; the token is the account id; staff PINs and Owner-added passwords are stored as typed and PINs are listed in the Switch user dialog's "Demo PINs" hint; the operator's demo sign-in, operator@primolar.demo with the demo password), the NestJS backend, real SMS/email sending and staff email invites, real file storage (and sanitising uploaded SVG logos), BIR
  official receipts, and every screen that currently renders `ComingSoon`. Their absence is intentional.
- **A claim that ages carries the date it was measured.** Any count or "every / all / none" statement
  written into something durable says when it was measured.
- **Red is not automatically yours.** A failing check in code this turn did not touch is evidence about
  the tree, not a defect to fix. Establish provenance first, never by stashing.
- **A priority label is not permission to start.** Check what has been decided before planning from a label.
