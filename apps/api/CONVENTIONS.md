# Conventions: apps/api

## What this is

The Primolar backend. It replaces the browser mocks (MSW) in `apps/web` **endpoint by endpoint, without changing
feature code in the web app**. The product, the users and the domain are the ones in the root `CONVENTIONS.md`
and `ROADMAP.md`; read those first. This file covers only how the API is built.

**Current phase: B1–B11 done** (2026-10-17). The runtime core (request context, `Clock`, logs, tenant scoping,
transactions, audit), `@pedia/seed`, the `test:int` suite on MySQL and CI, identity, sessions and the access guard,
`/auth/*`, `/operator/auth/*` and the clinic reads, with the web signing in against them in `hybrid` mode. B1-c added
the outbox, scheduled jobs and file storage. B3: the Owner's settings
(profile, look, logo, branches, staff logins, tier limits) and the clinic's reference data (chairs, procedures, note
and message templates), served in `hybrid`. B4: patients, guardians, consents, search and the list, the patient photo
and the clinic's privacy notice (Owner's and public), served in `hybrid`. B5: visits, the dental chart (append-only
entries, corrections as new rows) and the last visit in the patient list and header, served in `hybrid`. B6: clinical notes
(read-only once signed; signing completes plan items), growth and habits, and the treatment plan, served in `hybrid`.
B7: appointments without double-booking, parents' requests, follow-ups and recalls, the patient list's recall and visit
filters, and Today, served in `hybrid`. B8: bills, payments, deposits and credit (every money POST behind an
Idempotency-Key, gapless receipt numbers), voiding a bill made by mistake, refunds for the Owner and admins, balances
in the patient list and header, the day's collections and the financial dashboard, served in `hybrid`. B9: parent
texts queued in the transaction of the change that causes them (booking, move, no-show, a signed note, the due list's
recall text, the birthday greeting and its daily job), consent checked when queued, sent exactly once by the outbox
worker inside 8 AM–8 PM Manila (the log driver until `SEMAPHORE_API_KEY` is set), retried then shown as failed, and the
patient list's "no contact" and Today's greeting ticks, served in `hybrid`. B10: clinical photos and parents'
documents (uploads streamed through the API, checked, then stored; reads are a 302 to a 5-minute private link), the
issued-documents log with the mock's checks, S3 storage (local disk without `S3_BUCKET`), the patient photo off
multer, and each clinic's stored bytes, served in `hybrid`. B11: parents' portal accounts (staff invite a guardian by
SMS, the parent sets a password from the texted link, signs in with their mobile or email, resets it by text, and staff
can turn it off), sign-in by mobile, parents' own password change, a number change moving the sign-in, and every route a
parent can pass proven owner-checked, served in `hybrid`. B12 (operator console, sign-ups, subscriptions) is next. The
build order is [CHUNKS.md](CHUNKS.md).

**Stack:** NestJS 12 (ESM, Express) · Prisma 7 + MySQL 8.4 (MariaDB driver adapter) · Zod 4 schemas from
`@pedia/shared` · SWC at runtime (`@swc-node/register`) · Vitest + Supertest · Docker Compose for local MySQL.

---

## Commands

Run from the repo root.

| Purpose | Command |
| --- | --- |
| Full check (the closing gate; covers the API too) | `pnpm run check` |
| Fast check | `pnpm --filter api typecheck` |
| Tests, one file | `pnpm --filter api exec vitest run <path>` |
| Integration tests (real MySQL, `TEST_DATABASE_URL`) | `pnpm --filter api test:int [path]` |
| Start / stop local MySQL (port 3307) | `pnpm --filter api db:up` / `db:down` |
| Run the API (restarts on change) | `pnpm dev:api` → http://localhost:4100/api |
| New migration after editing the schema | `pnpm --filter api db:migrate --name <what>` |
| Apply migrations (CI, prod) | `pnpm --filter api db:deploy` |
| Load the demo clinics (demo deployments only) | `DEMO_LOGINS=true pnpm --filter api db:seed`. Refuses without the flag, and on a database that already has clinic accounts (`prisma migrate reset --force` first) |
| Regenerate the Prisma client | `pnpm --filter api db:generate` (also runs on install) |
| Browse the database | `pnpm --filter api db:studio` |

---

## Where things live

| Layer | Path | Owns |
| --- | --- | --- |
| Contract | `packages/shared/src/schemas/` | Zod schemas and types. **The only definition** of a request or response shape |
| Domain logic | `packages/shared/src/domain/` | Pure rules (permissions, chart derivation, money, tenancy, subscription dates). Call them, never re-implement them |
| The spec for each endpoint | `apps/web/src/features/<name>/mocks.ts`, `apps/web/src/mocks/` | Paths, shapes, status codes and rules the API must reproduce |
| Bootstrap | `src/main.ts` | Env, `/api` prefix, CORS, shutdown hooks. Nothing feature-specific |
| Root module | `src/app.module.ts` | `AppModule.forRoot(env)`: provides `ENV`, `Clock`, the logger, the global error filter and the request-context middleware; imports feature modules |
| Config | `src/config/env.ts` | Zod-validated environment, injected with `@Inject(ENV)`. The only reader of `process.env` |
| Database | `src/prisma/` | `PrismaService`, the only database client (global module), always tenant-scoped |
| Model scopes | `src/prisma/model-scope.ts` | `MODEL_SCOPE` (every model: clinic, branch or platform) and `APPEND_ONLY`. **Add every new model here** |
| Tenant extension | `src/prisma/tenant-scope.ts` | `scopeArgs`, `clinicData()`, the Prisma extension `PrismaService` applies |
| Transactions | `src/prisma/transaction.ts` | `runInTransaction(prisma, fn)` and the `Tx` type |
| Schema and migrations | `prisma/schema.prisma`, `prisma/migrations/` | Tables. Migrations are committed |
| Generated client | `src/generated/prisma/` | Git-ignored. Import from `../generated/prisma/client.ts` |
| Cross-cutting | `src/common/` | `ZodValidationPipe`, `HttpErrorFilter`, the request context (`request-context*.ts`: context + request id), `Clock` (`clock.ts`), `refusal.ts` (`Refusal`, `refuse()`: the mock's plain-text refusals that rules modules return) |
| Logging | `src/logging/logger.ts` | pino options and the redaction list (`PERSONAL_FIELDS`) |
| Audit trail | `src/audit/` | `AuditService.record` (import `AuditModule`) |
| Identity and access | `src/auth/` | `auth.controller.ts` / `operator-auth.controller.ts` and `auth.service.ts` (sign-in, sign-out, switch, password, acknowledgement), `rate-limit.ts` (`RATE_LIMITS`), `access-rules.ts` (the route → permission map, held to the mock's `RULES` by a test), `access.guard.ts` (the global guard), `record-owners.ts` (`RecordOwners`: features register who owns an `owner: "record"` route's record; the guard asks for parents only), `session.service.ts` (sessions), `identity.service.ts` (who a session is, PINs), `hashing.ts` (argon2id), `cookies.ts` |
| Clinic | `src/clinic/` | The account and its setup: `ClinicService` (context, profile, branding, logo, usage, chairs, procedures), `BranchesService`, `StaffService`; `limits.ts` (tier limits, from `TIER_LIMITS`), `account-lock.ts` (`ownClinicId`, `lockAccount`), `logo.ts` (`cleanLogo`: type sniffing and the SVG sanitiser), row shaping in `clinic.views.ts` |
| Patients | `src/patients/` | `PatientsService` (reads: `records`/`one` for other features, search, the list, the header summary, duplicates, the photo), `PatientWritesService` (register, edit, quick update, consents, privacy consent and choices, the photo swap), `patient.views.ts` (`visibleTo`: **the only producer of `PatientView`**; `toPatient`, `toSummary`, `viewerOf`), `patient.rows.ts` (contract → rows, the edit rules), `patient-search.ts` (the search as SQL), `patient-photo.ts`, `patient-lock.ts` (`lockPatient`, `lockPatientIfExists`). `FamilyService` (a parent's children) sits in its own `FamilyModule`, imported by `AuthModule` and `PatientsModule` |
| Visits | `src/visits/` | B5: `VisitsService` (list, start, complete, `forPatient` for the chart; B7 seats and finishes the appointment), `visit.rows.ts` (rows ↔ `Visit`), `VisitDaysService` (the days patients were seen: completed visits and done appointments) in its own `VisitDaysModule`, imported by `PatientsModule` |
| Appointments | `src/appointments/` | B7: `AppointmentRecordsService` in its own `AppointmentRecordsModule` (**the only reader and writer of `Appointment`**, Prisma only, so any feature can import it), `AppointmentsService` (calendar, book, move, status), `AppointmentRequestsService` (parents' requests), `appointment.rules.ts` (the mock's refusals: slot, move, status, request), `appointment.rows.ts`, `request.rows.ts` |
| Recalls | `src/recalls/` | B7: `DueItemsService` (owns `DueItem`: the due list, `afterSign`, `takeFor`, `backfill`), `due-item.rules.ts` (`signChange`, `bookedItem`, `dueBackfill`), `due-item.rows.ts`; `prisma/backfill-due-items.ts` |
| Reports | `src/reports/` | B7: `ReportsService` (`/reports/today`: the shared `todaySummary` over the branches' share), `report-branches.ts` (the mock's `reportBranches`). B8: `/reports/finance` (the shared `summarizeFinance` over SQL facts) and `collections.controller.ts` (`GET /payments`, the day's collections) |
| Billing | `src/billing/`, `src/billing-records/` | B8: `BillingRecordsService` in its own `BillingRecordsModule` (**the only reader and writer of Invoice, InvoiceLine, Payment and ReceiptCounter**; `billTotals` for balances, `financeFacts` for the dashboard, `nextReceipt`), `billing.rows.ts`, `finance-facts.ts`; `InvoicesService` (list, bill, void), `PaymentsService` (pay, deposit, apply credit, history), `billing.rules.ts` (the mock's refusals) |
| Idempotency | `src/idempotency/` | B8: `IdempotencyService.once` (claims the key in the write's own transaction; replays, 422 on another request), `keyOf` (the header's 400), `IdempotencyJobs` (the hourly sweep) |
| Clinic time | `src/clinic-time.ts` | Pins the process to Asia/Manila. Imported first by `main.ts`, the seed and the backfill, and a `setupFiles` of both test runners |
| Chart | `src/chart/` | B5: `ChartService` (reads and appends only), `chart.rules.ts` (the mock's refusals as a pure function), `chart.rows.ts` (rows ↔ `ChartEntry`, `CHART_ORDER`) |
| Legal | `src/legal/` | `PrivacyNoticeService` (owns `PrivacyNotice`: the version in force, the Owner's save, the public read) and the public `LegalController` (`GET /legal/notices/:clinicId`) |
| Notes | `src/notes/` | `NotesService`: templates (B3), notes and signing (B6); `note.rows.ts`, `note.rules.ts` (the mock's refusals, `checkValues`) |
| Growth | `src/growth/` | B6: `GrowthService` (one record per visit, replaced), `growth.rows.ts` |
| Plan | `src/plan/` | B6: `PlanService` (list, add, status; `completeBy` for signing), `plan.rows.ts`, `plan.rules.ts` |
| Messages | `src/messages/` | B3: `GET`/`PUT /message-templates`. B9: `GET /messages`, `POST /due-items/:id/message`, `POST /patients/:id/birthday-greeting`; `messages.jobs.ts` (the daily birthday job, 08:05 Manila, and the dead-letter repair) |
| Message queue | `src/message-queue/` | B9: `MessageQueueService` (the only reader and writer of `Message`: queue, withdraw, the birthday rule, the monthly count), `MessageSendHandler` (the `message.send` outbox kind), `SmsProvider` with `LogSmsProvider` and `SemaphoreSmsProvider`, `message.rows.ts` |
| Outbox | `src/outbox/` | `OutboxService.enqueue(tx, …)` (the write side, inside the caller's transaction), `OutboxWorker` (claim, run, settle), `OutboxHandlers` (features register a handler per kind), `NoopHandler` |
| Scheduled jobs | `src/jobs/`, `src/<feature>/<feature>.jobs.ts` | `JobRunner.run(job, fn)` (the `JobLock` lease). Each `@Cron` lives in the module that owns its tables: `auth.jobs.ts` (session and rate-limit sweeps), `outbox.jobs.ts` (prune), `messages.jobs.ts` (birthday greetings and the dead-letter repair, B9) |
| File storage | `src/storage/` | `StorageService` (clinic-scoped keys), `FileStorage` (the driver), `LocalDiskStorage`, and the `storage.delete` outbox handler (`delete-file.handler.ts`). Import `StorageModule` where files are kept |
| File storage (B10) | `src/storage/` | `S3FileStorage`, `fileStorageOf` (picks the driver), `readUpload` (busboy → temp file, `multipart.ts`), `sniff`, `LocalFilesController` (`GET /files/:token`, the local driver's signed links), the `StoredFile` ledger and `StorageService.link`/`putFile`/`usedBytes` |
| Portal | `src/portal/` | B11: `PortalService` (the only reader and writer of `PortalAccount` and `PortalLink`: invite, turn off, link check, accept, reset, the demo's texts, the link minter, a number change), `PortalAccessController` (`/patients/:id/portal-access`, `…/portal-invite`, `…/portal-off`), `PasswordLinksController` (`/auth/password-link`, `…/accept`, `/auth/password-reset`, `/auth/demo-texts`) |
| Photos | `src/photos/` | B10: `PhotosService` (the only reader and writer of `ClinicalPhoto`: list, upload, open), `photo-file.ts` (the file rule), `photo.rows.ts` |
| Documents | `src/documents/` | B10: `DocumentsService` (the issued-documents log), `documents.rules.ts` (the mock's checks, in order), `document.rows.ts` |
| Demo seed | `src/seed/seed-database.ts`, `prisma/seed.ts` | Maps `@pedia/seed`'s `seedPlatform()` to rows |
| Features | `src/<name>/` | `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`. Same `<name>` as `apps/web/src/features/<name>` |
| Tests | `src/**/*.test.ts` (unit), `test/*.test.ts` (HTTP) | Run without a database, in `pnpm run check`. HTTP tests build the app with `test/support/test-app.ts`. `test/clinic-routes.test.ts` (B3), `test/patients-routes.test.ts` (B4) and `test/clinical-routes.test.ts` (B5–B7) hold every route to "reaches a controller and the guard" (401 without a session); add a route there with its controller |
| Integration tests | `test/int/*.int.test.ts`, helpers in `test/int/support/` (`testPrisma`, `resetDatabase`, `inClinic`, `createIntApp`) | Real MySQL test database, `test:int`, run in CI (`.github/workflows/api.yml`, MySQL 8.4) |

### Porting a feature from MSW (fails silently if missed)

1. Read the feature's `mocks.ts` and its rule in `apps/web/src/mocks/access.ts`. That is the spec.
2. Add models to `prisma/schema.prisma` and run `db:migrate --name <feature>`. Commit the migration. List each new
   model in `MODEL_SCOPE` (and `APPEND_ONLY` if it is one), and create tenant rows with `data: { ...clinicData(), … }`.
3. Create `src/<name>/` with module, controller and service, and import the module in `AppModule.forRoot`. Give every
   controller route a rule in `src/auth/access-rules.ts`, the same as the mock's `RULES` (the drift test fails
   otherwise). Without one it answers 403 naming the route.
4. Validate every body, query and param with the **same shared schema** the web uses:
   `@Body(new ZodValidationPipe(PatientInput))`. Build responses so they parse with the shared response schema.
5. Port the feature's handler tests to `test/<name>.test.ts`, so the API is held to the same behaviour.
6. Turn the mock off only once every endpoint of the feature is served: add its routes to `API_ROUTES` in
   `apps/web/src/mocks/passthrough.ts`. In `hybrid` mode those reach the API; everything else stays on MSW.

---

## Data flow

Web `api(path, schema)` → `fetch(/api/...)` → controller → `ZodValidationPipe` (shared schema) → service →
`PrismaService` → response (parsed by the web with the shared schema).

- **The MSW handlers are the contract.** Same paths, methods, status codes and response shapes. If the API needs to
  differ, change the shared schema and the mock first, so the web keeps working in both modes.
- Controllers stay thin: parse input, call the service, return. Rules live in the service or in `@pedia/shared/domain`.
- Only services touch `PrismaService`. Controllers never do.
- No class-validator DTOs and no `ValidationPipe`. A second definition of a shape is how mock, API and UI drift apart.
- **Errors** go through `HttpErrorFilter`, in the shape `apps/web/src/lib/api-client.ts` reads:
  - invalid input → 400 whose body is the Zod issues array (throw via `ZodValidationPipe` or `ZodIssuesException`);
  - any other `HttpException` → its status with a **plain-text** message the user can read
    (`throw new NotFoundException("This patient no longer exists.")`);
  - anything unexpected → logged, then a generic 500. Never put internal details in a message.
- Validation wording comes from the shared schema, with `plainLanguageError` as the fallback (installed in `main.ts`).

---

## Scalability and maintainability

These hold from the first feature on. Chunk B1 builds the pieces they name.

**Module boundaries**
- One Nest module per feature. A module exports its **service**, never its Prisma access. Another feature reads that
  data by calling the service, so each table has one owner and can change without breaking the rest.
- No circular module imports. If two features need each other, the shared rule belongs in `@pedia/shared/domain`
  or in a smaller module both import.
- Pure rules (dates, money, chart derivation, permissions) live in `@pedia/shared/domain`, so the web and the API run
  the same code. A service orchestrates; it doesn't re-derive.

**Stateless instances**
- Nothing per-user or per-clinic lives in process memory: sessions, locks, queues and rate-limit counters live in
  MySQL (or Redis later). Any instance can serve any request, so the API scales by adding instances.
- Per-request data travels in the request context (AsyncLocalStorage), never in module-level variables.

**Tenancy**
- Tenant scoping is applied by the Prisma extension, not by each query. A tenant model is listed there, and a model
  missing from both the tenant and the platform list fails a test.
- Every tenant table's indexes start with `clinicId` (and `branchId` where it applies), so each clinic's queries
  stay fast however many clinics there are.

**Data**
- Ids are app-generated strings (`@default(cuid(2))`), never auto-increment: safe to expose, merge and shard.
- Money is `Int` centavos. Timestamps are UTC `DateTime`; calendar dates are `@db.Date` in Asia/Manila. "Now" comes
  from the injected `Clock`.
- Any write touching more than one row runs in one transaction (`runInTransaction`). A rule checked before a write
  (double-booking, tier limits, balances) is checked **inside** that transaction, with a lock or a unique constraint.
- Money-moving `POST`s take an idempotency key.
- A list that grows without bound (patients, appointments, payments, messages, audit) is paginated by cursor. Add the
  pagination to the shared schema and the mock first, then the API.
- Read only the columns a response needs (`select`), and never loop queries per row: use `include` or `in` (no N+1).

**Side effects**
- Anything leaving the system (SMS, email, webhooks) is written to the **outbox in the same transaction** as the
  change that caused it, and sent by the worker. Never call a provider from a request.
- Scheduled jobs are idempotent and take a DB lock, so running twice or on two instances is harmless.
- Uploads stream through the API to a temp file, are checked, then streamed to object storage; never held whole in
  memory (B10 decision 2). Reads are a 302 to a 5-minute private link (presigned on S3, signed locally).

**Migrations**
- Every schema change is a committed migration. Never edit a migration that has run anywhere but your machine.
- Changes are backward-compatible for one release (expand, migrate the data, then contract), so instances on the old
  and new code can run side by side during a deploy.

**Observability**
- Structured logs with the request id. **Never log patient data** (names, birth dates, contact details, clinical
  content): log ids. The redaction list is tested.
- Reads of patient records and every privileged action write an audit entry (RA 10173).

**Tests**
- Unit and HTTP tests run without a database, in `pnpm run check`. Services that query are covered by integration
  tests against a real MySQL test database (`test:int`), because a mocked Prisma can't catch a wrong query.
- Every rule in "Domain rules" has a test that would fail if it broke: tenancy leaks, contact stripping,
  append-only, double-booking under concurrency, idempotent payments.

---

## Domain rules

The root `CONVENTIONS.md` → "Domain rules" applies in full. These are the parts the database makes easy to get wrong:

- **Tenancy.** Every clinic record has `clinicId`, and branch-level records have `branchId` too. Every query is
  scoped to the signed-in account. No query ever reads across clinics, and the operator never reads patient records.
- **Access** is decided only by `ROLE_PERMISSIONS` / `rolesCan` in `packages/shared/src/domain/permissions.ts`, and
  the route-to-permission map mirrors `RULES` in `apps/web/src/mocks/access.ts`, deny by default. Never put a role
  check in a controller or service.
- **Contact data:** responses parse with `PatientView`. Guardian phones, emails, emergency contact and address are
  left out without `patients.contact`.
- **Append-only:** chart entries, payments and agreements are never updated or deleted. A correction is a new row
  (`supersedes`). Use no `update`/`delete` on those tables.
- **Money** is integer centavos (`Int`), never `Decimal` or `Float`. Balances are computed, never stored.
- **Age** is computed from date of birth, never stored.
- **Dates:** "today" for billing comes from one clock, never `new Date()` scattered through services (the mock's is
  `mocks/clock.ts`).
- Tier limits and follow-up rules are data, enforced in the service as well as the UI.

---

## Traps

- **Runtime is SWC, not `nest build`.** `@pedia/shared` ships TypeScript source with extensionless imports, which
  `tsc` output can't run. `node --import @swc-node/register/esm-register` compiles on load and emits decorator
  metadata. `tsc` only type-checks (`noEmit`). Don't add a build step to `@pedia/shared`. A production build
  (bundling) is still open.
- **Constructor injection relies on decorator metadata.** Inject classes by type. Tokens (`ENV`) need `@Inject(...)`.
  `import type` on an injected class erases it and breaks DI.
- **Nest 12 wraps arrays and objects** passed to an `HttpException` inside `{ message: [...] }`. That's why Zod issues
  travel on `ZodIssuesException.issues` and not in `new BadRequestException(issues)`.
- **Prisma 7:** the connection URL is in `prisma.config.ts`, not the schema. MySQL needs the
  `@prisma/adapter-mariadb` adapter (`PrismaService`). The client is generated as `.ts` files, so it's imported with
  a `.ts` extension (`allowImportingTsExtensions`).
- **`PrismaService` connects lazily**, so the API starts while MySQL is down. `/api/health` then waits about 30 s for the
  driver's timeout before it answers 503.
- **The shadow database** (`pedia_dental_shadow`, for `migrate dev`) is created by `docker/mysql-init.sql`, which runs
  only when the volume is first created. If it's missing, `docker compose down -v && pnpm --filter api db:up` (this
  wipes local data).
- **Ports:** MySQL is on 3307 (to avoid a Homebrew MySQL on 3306), and the API is on 4100 (4000 is used by another
  local project).
- **`.env`** is loaded by `main.ts` and `prisma.config.ts` only if it exists, and real environment variables win. A new
  variable goes in `Env` (`src/config/env.ts`), `.env.example` and `.env`.
- **`pnpm run check` never needs MySQL.** HTTP tests build `AppModule.forRoot(...)` and
  `overrideProvider(PrismaService)`. Tests that need a real database go in `test:int`, never in `check`.
- **The tenant extension doesn't see raw SQL or nested writes.** A raw query on a tenant table adds `clinicId`
  itself; create tenant children with their own top-level `create`.
- **Log redaction covers the top level and one level down only** (pino's `*`). Log ids, never whole records.
- **Prisma errors quote the query's arguments** (patient data) in their message. `HttpErrorFilter` withholds it; don't
  log a Prisma error anywhere else without the same treatment.
- **Prisma queries are lazy: await them inside `requestContext.run`.** `run(ctx, () => prisma.x.findMany())` returns
  the query unstarted; it runs when awaited, outside the context, and is refused as "needs a clinic". Write
  `run(ctx, async () => await prisma.x.findMany())` in workers, the seed and tests.
- **`TEST_DATABASE_URL` must end in `_test`**: every integration test empties it. `test:int` refuses anything else.
- **Raw SQL returns integers as `bigint`** through the mariadb driver (`COUNT(*)` → `3n`). Wrap them in `Number(...)`.
- **A deadlock in a raw query is P2010, not P2034**: the adapter's `TransactionWriteConflict` (MySQL 1213) sits in
  `meta.driverAdapterError.cause`. `isWriteConflict` (`src/prisma/transaction.ts`) accepts both; proven on MySQL.
- **`runInTransaction` reruns its callback on a deadlock** (`isWriteConflict`): nothing that leaves the database inside it.
- **HTTP tests that aren't about access** pass `openGuard: true` to `createTestApp` (or override `AccessGuard`). Tests of
  access use the real guard with fake `SessionService`/`IdentityService` (`test/access-guard.test.ts`).
- **A path with no controller is Nest's 404**, before any guard. "No access rule" (403) means a controller route
  missing from `access-rules.ts`.
- **A handler that must check the session before the body** (the mock's order: 401/403 before 400) takes
  `@Body() body: unknown` and parses after its checks, with the same `ZodValidationPipe`.
- **`identityOf(req)`** is set only where the guard loaded a clinic session (clinic routes, and `/auth/*` when a cookie
  was presented).
- **Integration tests that sign in repeatedly** clear `RateLimitCounter` in `beforeEach`: the limit counts per address.
- **Behind a proxy, set `trust proxy`** in `main.ts` (B13), or every client shares one rate-limit bucket.
- **Prisma 7's `migrate dev` doesn't regenerate the client.** Run `pnpm --filter api db:generate` after it.
- **Lists keep the clinic's order:** `Branch.position` and `Staff.position` (the mock's array order). New rows go last.
- **Background work starts only from `main.ts`** (`AppModule.forRoot(env, { background })`). Tests call
  `worker.drain()` and job methods directly; `createIntApp({ background: true })` only to check scheduling.
- **The outbox delivers at least once.** A handler must be idempotent and pass the row id to the provider as its
  idempotency key. Never call `enqueue` outside
  `runInTransaction`'s `tx`: TypeScript can't tell the root client from a transaction.
- **A job's `leaseMs` must be longer than a run and shorter than its cron period**, or it runs twice or skips ticks.
- **`LocalDiskStorage` is per instance.** Set `S3_BUCKET` before running a second instance; local links are signed with
  `STORAGE_LINK_SECRET` (unset: a random secret per process, so links die on restart; files don't).
- **`COOKIE_SECURE=false` only on local http.** It defaults to true; `DEMO_LOGINS` defaults to false.
- **Nest answers every `@Post` with 201.** The mock answers 201 only when it creates something (`POST /branches`,
  `POST /staff`); an action (`/archive`, `/deactivate`) answers 200. Give those `@HttpCode(200)`.
- **A rule checked before a write takes the clinic's lock first** (`lockAccount(tx)`, B3): tier limits, the
  one-email rule, the logo swap. Take it before any other row, so B3's transactions can't deadlock on each other.
- **Slow work goes before the transaction.** argon2 (a new login's secrets) and storing a file run first; the
  transaction only writes rows. A transaction can rerun (`runInTransaction`), and a lock is held for its whole length.
- **A database seeded before B3 has no reference rows** (chairs, procedures, templates), and `db:seed` refuses a
  database with accounts. Use a fresh volume (`docker compose down -v`) or a new database; `migrate reset` isn't used.
- **`migrate dev` won't run non-interactively when it warns** (a new unique index on existing rows). Write the SQL with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new
  `prisma/migrations/<timestamp>_<name>/migration.sql`, then `db:deploy` and `db:generate` (B3 did).
- **The logo passes through the API's memory** (multer, at most 1 MB) and is served as bytes, not a link: the PDF
  letterhead draws it into a canvas, which a cross-origin redirect would taint. Don't raise `LOGO_RULES.maxBytes`
  without moving it to `readUpload`.
- **`"branch"` scope narrows reads to the device's branch.** A branch-level table that is read account-wide (`Chair`)
  is `"clinic"` in `MODEL_SCOPE`, with `branchId` as a plain column.
- **A unit test that builds `StorageModule`** must override `OutboxModule` (it registers `storage.delete` there), as
  `storage.test.ts` does; the real one needs `PrismaService`.
- **A request's query string is never logged** (B4): `loggerParams` keeps the path only, because `?q=` and the
  duplicate check carry names and birth dates. Don't log `req.url` or `req.query` anywhere else either.
- **Patient search is raw SQL** (`patient-search.ts`): the tenant extension doesn't see it, so `PatientsService` writes
  `clinicId = …` first in every `WHERE`. The words are matched `COLLATE utf8mb4_bin` against the stored, lowercased
  `searchNames`/`searchPhones`; a write that changes a name or a guardian phone must rewrite them (`patientColumns`, or
  `refreshSearch` for PATCH's phone, which follows the guardian to siblings).
- **Every patient write locks the patient's row first** (`lockPatient`, which is also the 404); registration takes the
  clinic's lock (`lockAccount`) for the next number. Account before patient, never the other way round.
- **A database seeded before B4 has no patients**, and `db:seed` refuses a database with accounts: use a fresh volume or
  a new database, as for B3. The same for B5's visits and chart entries.
- **Lock before the first plain read.** MySQL's REPEATABLE READ takes the transaction's snapshot at its first plain
  (non-locking) read. A read before `lockPatient`/`lockAccount` would leave every later read blind to what the request
  that held the lock just committed: B5's plan read the visit first, and parallel corrections answered 500 and parallel
  completes all 200. Take the lock first (`lockPatientIfExists` when the 404 must come from something else), or make
  the first read a locking one (`SELECT … FOR UPDATE`, as `VisitsService.complete`). Race tests catch it.
- **Every visit and chart write locks the patient's row first** (`src/patients/patient-lock.ts`). `complete` locks the
  visit, then the patient; no path locks them the other way round.
- **A child row's patient is read outside the transaction, then `lockPatient`, then the row** (B6 decision 3: notes,
  growth, plan items). Safe because `patientId` never changes and nothing is deleted. No B6 path locks a child row
  first: sign holds the patient, then updates plan items, so a path that locked an item first would deadlock with it.
- **A signed note is read-only twice over:** the check under the lock, and every change is an `updateMany … signedAt:
  null` that must touch one row. A race test only fails when both are removed.
- **Growth's "can't be in the future" uses the process clock** (`SaveGrowthInput`), which reads Manila time since B7
  (`clinic-time.ts`), so B6 decision 8's 00:00–08:00 window is closed.
- **Upload routes read the raw request** (`readUpload`, busboy): no global multipart, raw or text body parser, or the
  stream is gone before the service reads it. The temp disk needs (instances × concurrent uploads × 10 MB) under
  `os.tmpdir()/primolar-uploads`; every upload's temp file is removed in `finally`.
- **The bytes decide a file's type** (`sniff`): JPEG, PNG or WebP for an image, `%PDF-` for a PDF; the stored and served
  type is the sniffed one. A photo's consent is read again under the patient's lock after the file is stored, and a
  "no" that landed in between queues the file's deletion (B10 E6).
- **`StorageService` writes the `StoredFile` ledger** (every put and delete), so unit tests that build `StorageModule`
  must provide `PrismaService` and `Clock`. Logos and patient photos stored before B10 have no ledger row.
- **The S3 bucket stays private** (Block Public Access, SSE-S3, no CORS: the browser only follows links), with
  versioning on and no lifecycle expiry (nothing is deleted on purpose), and the API's IAM role limited to
  `s3:PutObject`/`GetObject`/`DeleteObject` on `clinics/*`. A presigned link names the download file (the child's name)
  in `response-content-disposition`; it goes only to the signed-in browser, never to our logs. Presigned
  URLs need the host clock NTP-synced. Credentials: both `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` or neither (the
  SDK's default chain, an IAM role in production).
- **A database seeded before B10 has no photos, documents or ledger rows:** use a fresh one. `db:seed` writes the
  seeded photos' files through the API's own driver (`fileStorageOf`).
- **Records that share a time sort by id**, not insertion order: give seeded records that must read in order distinct
  times (B6 fixed the growth examples' tie).
- **The process runs in Asia/Manila** (`src/clinic-time.ts`, the first import of every entry point and test runner).
  The shared rules read local time (`outsideClinicHours`, `format`, `startOfWeek`); a new entry point that skips the
  import gets UTC days. `clinic-time.test.ts` is the guard.
- **Bookings and moves take `lockAccount` first** (E1: no double-booking); status changes, requests, visits and signing
  take the patient's lock. The global order is account → visit → patient → child rows (E2); no path takes them the
  other way round.
- **Every `Appointment` read and write goes through `AppointmentRecordsService`** (E4), so `VisitsService`,
  `BranchesService`, `VisitDaysService` and `DueItemsService` share one owner without a module cycle.
- **A database seeded before B7 has no appointments, requests or due items:** use a fresh one. On a live database,
  `pnpm --filter api db:backfill-due-items` opens the due items of notes signed before B7 (idempotent), and nothing else.
- **Every `Message` write for a child runs under that child's lock** (B9 E8). Book, status, sign, the reminders "no",
  the recall text and the greeting already held it; move takes it since B9, in the order account → patient →
  appointment, so a reminders "no" can't slip between move's consent read and its inserts. `Message` rows are written
  last; the send handler locks only its `Message` row.
- **`MessageQueueService` reads three other tables** to render a body (one template, the dentist's name, the account's
  name), each one column, read-only (B9 E1). That keeps its module a leaf; it isn't a pattern for writes.
- **Texts are sent exactly once, except in one window** (B9 E3, decision 13): the handler marks a text `dispatchedAt`
  and commits before calling the provider; a text found dispatched with no outcome (a crash or timeout mid-call) becomes
  failed, "Not confirmed by the SMS provider", and is never sent again. A withdrawal stops only undispatched texts.
- **Outbox handlers can steer the worker** (B9): `retryDelaysMs` (their own schedule), `deadLetter` (told once when a
  row is given up, by the claim that settled it), `OutboxDefer` (not now, without spending a try: sending hours) and
  `OutboxPermanent` (fail at once). The daily birthday job also repairs a text left `queued` when its outbox row failed
  and the hook never ran.
- **The log driver never logs a number or a body**, only the message id and its parts. Semaphore's contract was taken
  from its documentation as summarised (the docs host wasn't reachable when B9 was built): confirm it against
  api.semaphore.co/docs, and get the sender name approved on the Semaphore account, **before** setting
  `SEMAPHORE_API_KEY`. `SMS_SENDER_NAME=PRIMOLAR` (decision 18) is set only once Semaphore approves it; until then
  Semaphore's default name is used.
- **A database seeded before B9 has no messages:** use a fresh one.
- **Every money write locks in one order: the Idempotency-Key claim → the patient → the bill → the receipt counter**
  (B8 E1). The key claim is a raw `INSERT`: Prisma's `create` reads the row back, a plain read that would take the
  snapshot before `lockPatient` (the lock-before-the-first-read trap). The receipt counter is always the last lock.
- **Raw SQL money and dates:** `SUM` of an `INT` comes back as `DECIMAL` (a string), so wrap it in `Number`; a `Date`
  passed to raw SQL is written as UTC text (`utc()`, `manilaStartUtc`), since the process runs in Manila; a Manila day
  in SQL is `receivedAt + 8 hours`. MySQL's JSON column reorders an object's keys, so a replayed answer equals the
  first by value, not byte for byte.
- **`Payment` is append-only**; a refund or a returned credit is a new row, and one credit application's rows share
  one CR receipt number (legs 0, 1…). A bill is voided in place (`voidedAt`), never deleted, and its lines' `livePlanItemId`
  is cleared, so a plan item is on one live bill at most (unique index).
- **A database seeded before B8 has no bills or payments:** use a fresh one.
- **A file import cycle reads as a Nest "can't resolve dependencies" error**, not a cycle: `patient-lock.ts` imported
  `PATIENT_NOT_FOUND` from `patients.service.ts`, and B7's `PatientsService → DueItemsService → VisitsService →
  patient-lock` made the provider undefined at decoration time. Keep shared constants in the leaf file.
- **A batch's chart entries share `recordedAt`**; `GET /patients/:id/chart` breaks the tie by id, not insertion order.
- `test/app.test.ts` logs a stack trace on purpose (the "unexpected error" case). It isn't a failure.
- **An invite or reset link is made when its text is sent, never stored readable** (B11 E5). The log's body holds
  `[link]`; `MessageSendHandler` asks `AccountLinks` (the portal registers the one minter) inside its claim, stores only
  the token's SHA-256, and puts the link in the body it hands the provider. A retry after a definite failure mints a
  new token, so only the last text's link works. Lock order: `Message`, then `PortalLink` (a resend or a turn-off
  withdraws the texts before it cancels the links).
- **`PortalLink.demoToken` is filled only on a demo deployment (`DEMO_LOGINS`)**, for `GET /auth/demo-texts`. Elsewhere
  the route is a 404 and no usable link is in the database.
- **Set `WEB_URL` in production**: the texted links open the web app there (the default is dev's
  `http://localhost:3000`).
- **A patient edit takes the clinic's lock first since B11** (`update`, `quickUpdate`): a guardian's new number is
  checked against other parents' numbers under the same lock as an invite.
- **A database seeded before B11 has no portal accounts or mobile sign-ins:** use a fresh one.

---

## Decisions recorded

- **Ids** (B1): cuid2, generated by Prisma with `@default(cuid(2))`. The seed's readable ids (`staff_reyes`,
  `branch_imus`) are kept as given.
- **Table names** (B2): Prisma's defaults (`ClinicAccount`, not `clinic_accounts`), as `AuditEvent` already was. Never run
  the API against a non-Linux MySQL, which lowercases table names.
- **Sessions** (B2): 30 minutes idle and 8 hours absolute (`SESSION_POLICY`), stored as the token's SHA-256 in MySQL;
  `pd_session` and `pd_operator` are httpOnly, and operator sessions have their own table. Passwords and PINs are
  argon2id (`@node-rs/argon2`).
- **Identity tables** (B2): `Credential`, `Session` and `DemoLogin` are platform tables that hold a `clinicId`, because
  sign-in reads them before a clinic is known. Only `IdentityService`, `SessionService` and the seed touch them.
  Queries about one login name `clinicId` + `accountId`. Sign-in's lookups are cross-clinic on purpose, before a clinic
  is chosen: `Credential` by `email`, `DemoLogin` by `featured`, `Session` by its unique `tokenHash`. Never add a
  cross-clinic query on these tables outside sign-in and `SessionService.sweepExpired` (B1-c's sweep).
- **Body tokens** (B2): `Session.token` / `OperatorSession.token` carry placeholders (`"cookie"`, `"operator.cookie"`);
  the real tokens are only in the httpOnly cookies. A switch or password change rotates the session.
- **Rate limits** (B2): fixed windows in `RateLimitCounter`, per client address: 20 sign-ins per 5 minutes and 120 auth
  calls per minute (`RATE_LIMITS`), bound to the two auth controllers.
- **Demo login** (B2): `/auth/demo-accounts` and `DemoLogin` rows exist only when `DEMO_LOGINS=true` (demo deployments). There, the demo password can't be changed.
- **Outbox** (B1): polled from MySQL with `SELECT … FOR UPDATE SKIP LOCKED`; no Redis or BullMQ until volume says so.
  A claim leases rows by moving `availableAt` forward; a result is saved only while `attempts` still matches the claim.
  Delivery is at least once: handlers are idempotent and pass the row id to the provider as its idempotency key.
  Payloads hold ids only; `lastError` holds only an error's name and Prisma code. 5 attempts, backoff 30 s → 1 h, sent
  rows pruned after 7 days (`OUTBOX_POLICY`); since B9 a kind may bring its own schedule (`message.send`: 4 tries,
  about 1, 5 and 30 minutes apart).
- **Scheduled jobs** (B1): `@nestjs/schedule`, started only with `background` (`BACKGROUND_WORK`). Each run takes a
  `JobLock` lease shorter than the job's period and keeps it after a successful run, so a second instance's tick
  skips; a failed run releases it.
- **Storage** (B1): keys are `clinics/<clinicId>/<area>/<uuid>.<ext>`, built and checked only by `StorageService`;
  another clinic's key reads as missing and gets no link. The content type comes from an extension allowlist. Local disk
  or S3 (`S3_BUCKET`, B10).
- **Tier limits** (B3): `TIER_LIMITS` in `@pedia/shared` is the only copy; the tier is `ClinicAccount.tier`. What
  counts is `accountUsage` (open branches; active staff logins, the Owner included, parents never). Every limit-checked
  write locks the clinic's `ClinicAccount` row (`SELECT … FOR UPDATE`) and counts inside the transaction; proven with
  parallel requests in `test/int/tier-limits.int.test.ts`. `Staff(clinicId, email)` is unique as a backstop.
- **Logos** (B3): the declared type must match the first bytes (PNG, JPEG); an SVG is rebuilt by DOMPurify (jsdom, SVG
  profile) and refused when no `<svg>` root survives. Served with the mock's `sandbox` CSP and `nosniff`. A replaced or
  removed file is deleted through the outbox (`storage.delete`), queued in the transaction that unlinks it.
- **Reference keys** (B3): the contract's natural keys with the clinic, `Procedure(clinicId, code)`,
  `MessageTemplate(clinicId, kind)` and `NoteTemplate(clinicId, id)`; `Chair` keeps a cuid id. The seed's ids are kept,
  so MSW's records and the API's agree in `hybrid`.
- **Archiving and bookings** (B3, filled in B7): `BranchesService.upcomingAt` counts the branch's booked, confirmed,
  arrived and in-chair appointments from now on, in the archive's transaction after its clinic lock.
- **Audit** (B3): the mock's entries for staff writes (`Staff login`, `… (deactivated)`, `… (reactivated)`), in the
  write's transaction. Profile, branding and branch changes aren't audited, as in the mock.
- **Patients** (B4, decisions in `.claude/plans/feature-chunk-b4-patients-plan/decisions.md`):
  - **Search** is the mock's `matchesSearch` exactly (substring, every word, child and guardian names, phone digits only
    for `patients.contact`), as `LIKE '%word%'` over two stored columns built by the shared `patientSearchText`. A
    leading wildcard can't use an index, so a search scans one clinic's rows; full-text when a clinic passes ~10k.
  - **No column encryption** of medical fields: the disk is encrypted (B13).
  - **`/patient-summaries` and the header summary** are the API's; last visit, recall and balance are filled (B5, B7,
    B8); "no contact" from each child's last sent or failed text (B9, `lastTried`).
  - **Audit**: one `view` "Patient profile" per single-record read (`GET /patients/:id`, its summary) and `view`
    "Patient photo", except that the same user viewing the same record again within five minutes isn't logged twice
    (`REPEAT_WINDOW_MS`, B1, as the mock); **lists, searches and duplicate checks aren't audited**, unlike the mock's "Patient list" entries.
    Writes keep the mock's entries, in their transaction, so a refused write leaves none.
  - **Parents** are linked to their children from B4: `IdentityService` fills `ClinicIdentity.children` per request.
  - **Guardians** are one row per (child, guardian): siblings share the guardian id, a PUT replaces one child's rows, and
    PATCH's phone follows the guardian id to every child.
  - **Photos** are JPEG, PNG or WebP by their bytes (the mock takes any `image/*`): nothing that can carry script is
    served from the API's origin.
  - **Paging** stays the contract's `page`/`pageSize`, and `GET /patients` is unpaged, both as the mock. A cursor needs
    the shared schema and the mock changed first.
- **Visits and the chart** (B5, decisions in the B5 plan):
  - `ChartEntry` is in `APPEND_ONLY`: no update or delete path; a correction is a new row with `supersedes`, unique per
    `(clinicId, supersedes)` as the backstop. The chart, "as of a visit" and per-tooth history are `deriveChart()` in the
    web over `GET /patients/:id/chart` (all entries, oldest first): no server endpoint for them.
  - The mock's chart refusals live in `chart.rules.ts`, a pure function with a unit test per branch.
  - Every visit and chart write locks the patient first: one visit in progress per patient and one correction per entry
    hold under parallel requests (tested).
  - `lastVisitOn` is the shared rule over completed visits and (since B7) done appointments.
  - Audit: the mock's names (`view` "Visits"/"Dental chart", `create` "Visit", `update` "Visit (completed)", `update`
    "Dental chart" once per request), written in the write's transaction.
- **Notes, growth and the plan** (B6, decisions in the B6 plan; the user confirmed 1, 4, 5 and 8):
  - Signing completes the plan items it covers (`itemsCompletedBy`) and (since B7) opens its due item, in its
    transaction, and since B9 queues the procedure's care text (`NOTE_MESSAGES`) in it.
  - Any staff with `clinical.write` may edit and sign a draft, even after the visit; the author is the visit's dentist.
  - A signed note is read-only in `NotesService` (lock + guarded update); `ClinicalNote` isn't append-only (drafts edit).
  - `sourceChartEntryId` is stored as given, unchecked, as the mock.
  - Audit: the mock's names, in the write's transaction; the items a sign completes add no "Treatment plan" entry.
  - Progress, the habit timeline and the behaviour trend stay the web's (`planProgress`, `habitTimeline`).
  - Accepted until later chunks: `hybrid` gaps in MSW's recalls, billing and documents (decision 2); a child row's
    patient read outside the transaction, then locked (decision 3); growth's future check on the process clock until
    B13 (decision 8); an over-long `speech`, free-text note value or `sourceChartEntryId` answers 500 and writes nothing
    until `@pedia/shared` caps their lengths, together with B5's `note` and `appointmentId` (decision 9). The same for a
    plan item `fee` above MySQL's `Int` (2,147,483,647 centavos) and a path id of 192+ characters on the audited reads.
- **Billing** (B8, decisions in the B8 plan; the user confirmed 1–4 and Questions 1–5):
  - Receipt numbers: one sequence per clinic and series (`AR-` money received, `CR-` deposit credit), gapless under
    parallel payments (a counter row locked to commit). Acknowledgment receipts, not BIR official receipts.
  - A bill made by mistake is voided with a reason, by the Owner or an admin (`billing.adjust`), only while no payment
    row ever touched it (refunded or not). It stays on record, counts in no balance or total, frees its treatments to
    be billed again, and is hidden from parents.
  - Refunds (on a bill or a deposit) are the Owner's and admins' (`billing.adjust`); moving deposit credit isn't a
    refund (`billing.collect`). Payments are always dated now.
  - Every POST that records a bill or money needs an `Idempotency-Key` (400 without); a retry replays the stored answer
    with `Idempotent-Replayed: true`, another request with the key is 422, a refusal frees the key; keys last 24 hours.
  - Balances are computed, never stored: the list and header sum live bills in one aggregate query (`billTotals`), the
    dashboard from six bounded SQL sums fed to the shared `summarizeFinance` (no rule re-derived; parity tested).
  - An appointment billed twice is judged by its first bill, as the demo (changed later everywhere at once). The
    daily list and the dashboard aren't audited (B7 decision 6); each child's bills and payments are.
  - Voiding takes no Idempotency-Key: a repeat answers 409 "already voided", which is safe to retry (E9).
  - Money belongs to a branch: a payment to its bill's branch wherever it's paid, a deposit to the device's branch, and
    a credit draws the bill's branch's deposits first (E11, `depositLegs`). The day's list and the dashboard filter by it.
  - The demo keeps Idempotency-Keys in memory per clinic for 24 hours (E12); the API in `IdempotencyKey` rows.
  - A payment's reference number is capped at 100 characters and a refund's or void's reason at 500 (E13).
- **Parent portal accounts** (B11, decisions in the B11 plan's `decisions.md`, settled with the user before planning):
  - Any guardian with a mobile number can be invited, by staff with `portal.manage` (front desk, the Owner, admins)
    from the child's Overview; registering sends nothing (1, 2, 16). The invite is an SMS through the B9 queue with
    sender PRIMOLAR; no email in B11 (3). Status per guardian: not invited, invited (with expiry), active, off (17).
  - Links: an invite works once for 72 hours, a reset once for 30 minutes; a resend cancels the older link (5, 6).
    Invite and reset texts go at any hour and even when the family declined reminders (12, 20), and count in SMS usage (21).
  - Sign-in by mobile or email in one box (4); one mobile (or email) is one sign-in per clinic, a second guardian on a
    taken number is refused, a shared email leaves that parent on their number (14); one account per clinic, with the
    chooser (9). The staff password rule for everyone (8); parents change theirs in the portal (7).
  - Forgot password never says whether an account exists; 3 reset texts per number per hour (19).
  - A guardian removed from their last child stops being a login at once (10); a number changed by staff moves the
    sign-in and ends the parent's sessions (15); staff can turn one guardian off, which signs them out (18). A suspended
    clinic's parents still sign in, read-only (11). After setting a password, the privacy notice, then the portal (22).
  - The seeded parents are active on the demo password, in development and tests only (13).
- **Photos and documents** (B10, decisions in the B10 plan's `decisions.md`, settled with the user before planning):
  - Amazon S3 in ap-southeast-1 in production through an S3-compatible driver (R2 by config); local disk in development
    and tests (1). Uploads go through the API, checked, then streamed to storage; never presigned uploads (2, E1).
  - Opening a file is a 302 to a private link valid `FILE_LINK_SECONDS` (300), `no-store`, re-checked and audited on
    every open (3, E2). Three isolation layers: tenant-scoped rows, `StorageService` links only its clinic's keys, and
    an encrypted local-link token (AES-256-GCM over the key and expiry: no name in a URL or log) (E8).
  - The demo's limits: 10 MB, images only, PDFs only for documents and referrals (4); the bytes decide the type (E4).
    A body declaring more than twice the limit is refused before it is read (E13). Photos are never edited or deleted (5). Parents upload intraoral, extraoral and medical documents, blocked when the
    family declined photos (7, E12).
  - The documents log stores no PDF: the browser builds it after a 201, so a refused document makes no file (6). The
    checks run in the mock's order: issuer (any staff row, deactivated included), dentist, source, allergy.
  - Each clinic's stored bytes are counted in the `StoredFile` ledger (8, E5), never limited in B10 (limits: B12).
- **Messages** (B9, decisions in the B9 plan's `decisions.md`, settled with the user before planning; 13–17 after):
  - SMS only, through Semaphore; no email in B9 (1). One platform-owned Semaphore account (2) and one shared sender
    name, with the clinic's name in the text (3); "PRIMOLAR" (18, set once Semaphore approves it).
  - Texts go out 8 AM–8 PM Manila only; anything due outside waits until 8 AM, at queue time and again at send time (4).
  - A failed send retries about 1, 5 and 30 minutes later, then shows as failed with its reason; no Resend (5). A
    number that isn't a Philippine mobile fails at once, "No phone number" (12). An in-doubt send is never resent (13).
  - Texts go to the primary guardian's phone only (6). Consent is checked when a text is queued; a reminders "no"
    withdraws the child's waiting texts in its own transaction.
  - A cancel withdraws an appointment's waiting texts; a move withdraws them and queues the new time's, a new
    confirmation included (7, 17); a no-show also queues the missed-appointment text.
  - Birthday greetings: a daily job at 08:05 Manila, once per child per Manila year (`greetingYear`, unique), the
    button kept (8); suspended clinics get none, while their queued texts still go (16). Recall texts stay manual (9).
  - Each clinic's sent texts and billed parts per month are counted, never stored and never blocking (10, 14): limits
    come with B12. The log driver is used everywhere, production included, until `SEMAPHORE_API_KEY` is set (11).
  - The log stays unpaged, as the demo; it shows the guardian's number to anyone with `messages.view` (15: dentists
    don't hold it). Only a child's log is audited ("Messages").
- **Scheduling, follow-ups and Today** (B7, decisions in the B7 plan; the user confirmed 1–4 and 6):
  - Double-booking is the demo's rule: the same chair or the same dentist at an overlapping time, at any branch; the
    same child twice is allowed (1). Bookings and moves serialise on the clinic's row (E1), tested with parallel requests.
  - A parent may confirm their own child's appointment, and nothing else on it (2): `RecordOwners` resolves the record's
    patient for own-scope callers only.
  - Same-time appointments list in chair order (5). Whole-day screens (the calendar, the inbox, the due list, Today)
    aren't audited, as the patient list (6); a child's appointments and requests are.
  - Due items store the visit they came from (`visitId`, E6) to name the dentist; whether an item is open is computed
    (`isDueItemOpen`), never stored, except signing's `closedAt` when a newer item replaces it.
  - The patient list computes each row's standing in memory with the shared rules (E7): every match's visit days and
    open items per request, three indexed queries. A clinic past ~10k patients needs stored columns.
  - Today runs the shared `todaySummary` unchanged over a narrowed input (today's appointments, the week's patients'
    visit days, the pending requests, every patient's name and birthday); parity is tested against the mock.
- **Seed** (B1): `packages/seed` (`@pedia/seed`), so MSW and `prisma db seed` run the same `seedPlatform()`. Not
  `@pedia/shared`: the seed needs faker and is built from `new Date()`, which don't belong in the contract package.

---

## Reporting rules

The root `CONVENTIONS.md` → "Reporting rules" applies. Two more:

- **Not yet decided:** each chunk in [CHUNKS.md](CHUNKS.md) lists its open decisions under "Decide first". Settle them
  (grill-me or the architect) before building the chunk, then record the answer here.
- **"Ported" means the feature's handler tests pass against the API**, not that the endpoints exist.
