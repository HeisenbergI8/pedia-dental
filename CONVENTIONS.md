# Conventions

## What this project is

Primolar: pediatric dental clinic management sold as a service to many clinics. Each paying clinic is a
**clinic account** with its own branches, staff, patients and branding (ROADMAP feature 16). **Current phase: the web runs against the API** (`apps/api`, its own rules in `apps/api/CONVENTIONS.md`) in every
deployment (`NEXT_PUBLIC_API_MOCKING=disabled`, B13c1). MSW stays as the offline mode (`enabled`): every call answered in
the browser from fake, seeded data, for UI work and the pilot specs; `hybrid` (MSW running, the API's routes passed
through) is kept for the bridge-cookie tests. The MSW handlers were the API's contract, and `apps/api/test/port-ledger.ts`
holds each web handler test to an API test. A clinic joins through
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
| Run the app locally | `pnpm dev:api` (MySQL up and seeded: README → Run it), then `pnpm dev` → http://localhost:3000 |
| Run offline (MSW, no API) | `NEXT_PUBLIC_API_MOCKING=enabled pnpm dev` |
| The client demo script against the API, end to end | Fresh seeded database, the API and a `disabled` web: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-demo-script.spec.ts --project=desktop`. Start-up: the spec's header (about 13 sign-ins) |
| The API's production build and image | `pnpm --filter api build`, `docker build -f apps/api/Dockerfile -t primolar-api .`: `apps/api/README.md` → Production build and image |
| AWS infrastructure (CDK): test, synthesize, diff | `pnpm --filter @pedia/infra test` (in `check`), `pnpm --filter @pedia/infra exec cdk synth -q` / `cdk diff <stack>`. Deploys: Actions → deploy (`packages/infra/runbooks/deploy.md`); every AWS step is run by the owner, never by an agent |
| Run against the real API | `NEXT_PUBLIC_API_MOCKING=hybrid API_PROXY_TARGET=http://localhost:4100 pnpm dev` with `pnpm dev:api` running (`DEMO_LOGINS=true COOKIE_SECURE=false`, seeded with `pnpm --filter api db:seed`). `enabled` = MSW answers everything (the demo); `hybrid` = MSW answers all but `API_ROUTES` (`mocks/passthrough.ts`: since B2, sign-in, `/operator/auth/*` and the clinic reads; since B3, the Owner's settings, `/clinic/usage`, the logo and the reference data; since B4, patients, consents, the patient photo and the privacy notice; since B5, visits and the dental chart; since B6, notes, growth and the treatment plan; since B7, appointments, parents' requests, the due list and Today; since B8, bills, payments, deposits, voids, the day's collections and the financial dashboard; since B9, the message log, recall texts and birthday greetings; since B10, clinical photos, the issued-documents log and the API's `/files/<token>` links; since B11, portal access, invites, the set-password and reset links and `/auth/demo-texts`; since B12, every `/operator/*` route, the public `/signups*` routes and `/clinic/subscription*`), which go through Next's `/api` proxy to the API; `disabled`/unset = no MSW |
| Sign-in against the API, end to end | Both servers on free ports (the web on its own `NEXT_DIST_DIR=.next-hybrid`), then in `apps/web`: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-sign-in.spec.ts --project=desktop`. Start-up commands: the B2d plan, Step 4.1. It signs in 10 times; the API allows 20 sign-ins per 5 minutes per address |
| Owner settings against the API, end to end | As sign-in, against a fresh database that has B3's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-owner-settings.spec.ts --project=desktop` (9 sign-ins a run). Start-up commands: the B3 plan, Step 11.1 |
| Notes, growth and the plan against the API | Fresh database with B6's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-notes-plan.spec.ts --project=desktop` (4 sign-ins a run). Start-up commands: the B6 plan, Step 7.2 |
| Scheduling against the API | Fresh database with B7's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-scheduling.spec.ts --project=desktop` (8 sign-ins a run; re-runnable on one database). Start-up commands: the spec's header, or the B7 plan, Step 9.2 |
| Billing against the API | Fresh database with B8's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-billing.spec.ts --project=desktop` (about 8 sign-ins a run; re-runnable on one database). Start-up commands: the spec's header, or the B8 plan, Step 10.2 |
| Messages against the API | Fresh database with B9's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-messages.spec.ts --project=desktop` (7 sign-ins a run; re-runnable on one database; texts outside 8 AM–8 PM Manila stay Queued). Start-up commands: the spec's header, or the B9 plan, Step 9.3. Running it with the B7 and B8 specs in one go can trip the sign-in limit: clear `RateLimitCounter` between them |
| Operator console, sign-ups and receipts against the API | Fresh database with B12's rows: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-operator.spec.ts --project=desktop` (one sign-up a run, so it re-runs on one database; clear `RateLimitCounter` between specs). The API needs `DEMO_LOGINS=true`, `STORAGE_DIR` and `STORAGE_LINK_SECRET`: the spec's header |
| Parent portal accounts against the API | Fresh database: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-portal.spec.ts --project=desktop` (6 sign-ins and 2 link sign-ins a run; re-runnable on one database). The API needs `DEMO_LOGINS=true` (the texted links come from `/auth/demo-texts`) and `WEB_URL`: the spec's header |
| Photos and documents against the API | Fresh database with B10's rows and files: `E2E_API=1 E2E_BASE_URL=… npx playwright test e2e/api-photos-documents.spec.ts --project=desktop` (6 sign-ins a run; re-runnable on one database). Start-up commands, with `STORAGE_DIR` and `STORAGE_LINK_SECRET`: the spec's header |
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
| Infrastructure | `packages/infra/` (`@pedia/infra`) | AWS CDK: `PrimolarFoundation` (network, RDS, S3, ECR, certificate, alerts, budget, deploy role) and `PrimolarService` (ECS, ALB, logs, alarms); settings in `cdk.json`; runbooks in `runbooks/`. Tests synthesize offline |

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
- A bill made by mistake is voided (a reason, nothing ever paid or applied on it), never deleted; a voided bill counts
  in no balance or total (`liveInvoices`, `isVoided`) and is hidden from parents. Refunds and voids need
  `billing.adjust` (the Owner and admins); front desk records payments, deposits and deposit credit.
- Every POST that records a bill or money sends an `Idempotency-Key` (`lib/idempotency.ts`: one key per form attempt,
  kept for a retry whose answer was lost). The mock and the API record it once.
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
  The API settles in a nightly job (00:05 Manila) and at sign-in, not per request.
- B12: a month is billed at the price list in force when it began (`priceOn`, `PriceChange`): a change applies to
  months that start after it. A downgrade the clinic doesn't fit is refused (`downgradeProblem`); while one waits,
  additions are checked against the smaller plan (`limitTier`). Clinics pay by Primolar's one QR and send a receipt
  (one waiting at a time); the operator confirms only the full amount due or rejects with a reason; receipts are the
  Owner's and the operator's only. The Owner of a clinic paused for non-payment signs in to a billing-only session
  (`SessionUser.billingOnly`, `BILLING_ONLY_ROUTES`). Plans carry storage and text allowances (`TIER_LIMITS`):
  storage is refused at upload (the API checks at its ledger), and a template text past the month's parts fails and is
  never sent later (the mock checks when it queues, the API when it sends); account texts always go.
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
- Parents sign in only once invited (B11): `Db.portalAccounts` holds each guardian's portal access (`invited`, `active`,
  `off`; none = not invited) and `allAccounts` lists a parent only while `active`. One mobile number (or email) is one
  sign-in per clinic; the mobile is read from the guardian, so it follows a number change. The sign-in box takes a
  mobile or an email (`LoginId`, still the `email` field on the wire). Invites and reset links are account texts
  (`portal_invite`, `password_reset`: `LoggedMessageKind`, never a template): sent at any hour, whatever the reminders
  choice, the link logged as `[link]`, and ignored by "no contact". Staff manage it with `portal.manage` (front desk,
  the Owner, admins).

---

## Traps

- MSW 3 renamed `onUnhandledRequest` to `onUnhandledFrame`. Older MSW docs and examples are wrong here.
- `msw/browser` has no server build. `next.config.ts` aliases it to `false` on the server; keep that,
  and only import `@/mocks/browser` dynamically from `app/providers.tsx`.
- `NEXT_PUBLIC_*` env vars are inlined at build time. Changing `.env.local` needs a dev-server restart.
- **The demo's help follows the API** (B13c1 E4): the demo logins, texts, PINs and the operator hint show whenever
  `GET /auth/demo-accounts` answers (MSW, or an API with `DEMO_LOGINS=true`), whatever the mocking mode. **Reset demo
  data** clears MSW's copy, so it shows only while MSW runs (`canResetDemoData`).
- **A new route needs its API controller and its MSW handler.** `passthrough.test.ts` fails when a handler's route is
  missing from `API_ROUTES`; a new web handler test needs a twin API test or a line in `apps/api/test/port-ledger.ts`.
- In `enabled` mode only, mock data lives in `localStorage`. After changing `seed()` or `Db`, bump the key in `mocks/db.ts`
  or clear storage, or you'll keep seeing old data. The key is `pedia-dental:mock-db:v31`; each bump gets a
  one-line comment above it saying why.
- The mock store is partitioned by clinic account: `Platform = { accounts, tenants, signups, prices, subscriptions, agreements, priceChanges, paymentQr, receipts }`
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
- In `hybrid`, the clinic, its branches, staff logins and reference data live in MySQL (B3) while every other record is
  MSW's localStorage. Both are seeded from the same `@pedia/seed`, with the same ids, and never synced: a staff login or
  branch added in `hybrid` exists only on the API, so that login's MSW screens answer 401 (the app signs it out) and MSW
  lists fall back to its own first branch. Since B4, patients, their
  consents and photo, and the privacy notice are the API's: a child registered in `hybrid` exists only on the API, so
  MSW's visits, chart, billing and appointments answer `Patient not found` for them; MSW's parent gate still uses MSW's
  families. Since B5, visits and the chart are the API's. Since B6, notes, growth and the plan are the API's. Since B7,
  appointments, requests, due items and Today are the API's. Since B8, bills, payments, deposits, voids, the day's
  collections and the financial dashboard are the API's. Since B10, clinical photos, the issued-documents log and the
  API's file links are the API's too: a file read is a 302 to a 5-minute link (`/api/files/<token>` locally, S3 in
  production), which `<img>` and `<a>` follow by themselves (inside MSW's service worker for an `<img>`, so the page
  sees the final 200). Never `fetch()` a photo or draw it into a canvas without adding CORS to the bucket. Since B9, the message log, recall texts and birthday greetings are the API's, and
  so are the texts its bookings, moves, no-shows, signed notes and reminders "no" queue or withdraw. The API sends them
  through its outbox worker, with the log driver (ids and part counts logged, nothing sent) until `SEMAPHORE_API_KEY`
  is set.
  Since B11, parents' portal accounts are the API's: staff invite and turn off from the Overview, the signed-out
  link routes set and reset passwords, and only a demo deployment (`DEMO_LOGINS`) lists the texted links.
  Since B12, the operator console, sign-ups, prices, the payment QR, subscriptions and receipts are the API's: a clinic
  approved in `hybrid` exists only on the API (its MSW screens answer as for a login added there).
  Resetting one store doesn't reset the other. MSW passes a request through by fetching it from its worker, so in
  Playwright `fromServiceWorker()` is true either way: tell an API answer by its `x-request-id` header.
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
  Owner-settings tests live in `mocks/owner-settings.test.ts`, since they change tiers, staff and branches. The same
  cases run against the API in `apps/api/test/int/owner-settings.int.test.ts`; change both together.
- The operator is not a clinic user: token `operator.<id>`, cookie `pd_operator`, routes `/operator/*`, store
  `stores/operator-session-store.ts`. Operator handlers read `platform.tenants[id]` and never touch `db`,
  `selectTenant` or `sessionOf` (guarded in `mocks/operator.test.ts`, which also sends the operator token to every
  clinic route). Operator query keys start with `"operator"`: the global 401 handler in `app/providers.tsx` signs out
  the operator, not the clinic user, on that prefix. Operator tests live in `mocks/operator.test.ts`, cross-branch
  report tests in `mocks/cross-branch.test.ts`. The same guard reads `features/operator/signup-mocks.ts`,
  `features/signup/mocks.ts`, `features/legal/mocks.ts`, `mocks/signups.ts`, `mocks/subscriptions.ts` and (B12)
  `features/operator/payment-mocks.ts`, `mocks/receipts.ts` and `mocks/allowances.ts`: public,
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

- **A deferral is not a gap.** Deliberately deferred for the prototype: real authentication in the MSW demo (the demo
  login is a demo control: anyone can sign in as any account with the shown password; the token is the account id; staff PINs, Owner-added passwords and parents' own passwords are stored as typed, and the demo keeps invite and reset link tokens as typed and lists them on the sign-in page ("Demo texts"); a number change can't sign a demo parent out (B11) and PINs are listed in the Switch user dialog's "Demo PINs" hint; the operator's demo sign-in, operator@primolar.demo with the demo password), real SMS sending (the API has it since B9, but logs instead of sending until `SEMAPHORE_API_KEY` is set), email sending (staff and parent invites; parents are invited by SMS since B11), real file storage in the demo (MSW keeps files in the browser; the API stores files in S3 or on its disk since B10, and sanitises uploaded SVG logos since B3), BIR
  official receipts, and every screen that currently renders `ComingSoon`. Their absence is intentional.
- **A claim that ages carries the date it was measured.** Any count or "every / all / none" statement
  written into something durable says when it was measured.
- **Red is not automatically yours.** A failing check in code this turn did not touch is evidence about
  the tree, not a defect to fix. Establish provenance first, never by stashing.
- **A priority label is not permission to start.** Check what has been decided before planning from a label.
