# Conventions: apps/api

## What this is

The Primolar backend. It replaces the browser mocks (MSW) in `apps/web` **endpoint by endpoint, without changing
feature code in the web app**. The product, the users and the domain are the ones in the root `CONVENTIONS.md`
and `ROADMAP.md`; read those first. This file covers only how the API is built.

**Current phase: B1–B5 done** (2026-10-16). The runtime core (request context, `Clock`, logs, tenant scoping,
transactions, audit), `@pedia/seed`, the `test:int` suite on MySQL and CI, identity, sessions and the access guard,
`/auth/*`, `/operator/auth/*` and the clinic reads, with the web signing in against them in `hybrid` mode. B1-c added
the outbox, scheduled jobs and file storage. B3: the Owner's settings
(profile, look, logo, branches, staff logins, tier limits) and the clinic's reference data (chairs, procedures, note
and message templates), served in `hybrid`. B4: patients, guardians, consents, search and the list, the patient photo
and the clinic's privacy notice (Owner's and public), served in `hybrid`. B5: visits, the dental chart (append-only
entries, corrections as new rows) and the last visit in the patient list and header, served in `hybrid`. B6 (notes,
growth, behaviour and the treatment plan) is next. The
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
| Cross-cutting | `src/common/` | `ZodValidationPipe`, `HttpErrorFilter`, the request context (`request-context*.ts`: context + request id), `Clock` (`clock.ts`) |
| Logging | `src/logging/logger.ts` | pino options and the redaction list (`PERSONAL_FIELDS`) |
| Audit trail | `src/audit/` | `AuditService.record` (import `AuditModule`) |
| Identity and access | `src/auth/` | `auth.controller.ts` / `operator-auth.controller.ts` and `auth.service.ts` (sign-in, sign-out, switch, password, acknowledgement), `rate-limit.ts` (`RATE_LIMITS`), `access-rules.ts` (the route → permission map, held to the mock's `RULES` by a test), `access.guard.ts` (the global guard), `session.service.ts` (sessions), `identity.service.ts` (who a session is, PINs), `hashing.ts` (argon2id), `cookies.ts` |
| Clinic | `src/clinic/` | The account and its setup: `ClinicService` (context, profile, branding, logo, usage, chairs, procedures), `BranchesService`, `StaffService`; `limits.ts` (tier limits, from `TIER_LIMITS`), `account-lock.ts` (`ownClinicId`, `lockAccount`), `logo.ts` (`cleanLogo`: type sniffing and the SVG sanitiser), row shaping in `clinic.views.ts` |
| Patients | `src/patients/` | `PatientsService` (reads: `records`/`one` for other features, search, the list, the header summary, duplicates, the photo), `PatientWritesService` (register, edit, quick update, consents, privacy consent and choices, the photo swap), `patient.views.ts` (`visibleTo`: **the only producer of `PatientView`**; `toPatient`, `toSummary`, `viewerOf`), `patient.rows.ts` (contract → rows, the edit rules), `patient-search.ts` (the search as SQL), `patient-photo.ts`, `patient-lock.ts` (`lockPatient`, `lockPatientIfExists`). `FamilyService` (a parent's children) sits in its own `FamilyModule`, imported by `AuthModule` and `PatientsModule` |
| Visits | `src/visits/` | B5: `VisitsService` (list, start, complete, `forPatient` for the chart), `visit.rows.ts` (rows ↔ `Visit`), `VisitDaysService` (the last visit's day) in its own `VisitDaysModule`, imported by `PatientsModule` |
| Chart | `src/chart/` | B5: `ChartService` (reads and appends only), `chart.rules.ts` (the mock's refusals as a pure function), `chart.rows.ts` (rows ↔ `ChartEntry`, `CHART_ORDER`) |
| Legal | `src/legal/` | `PrivacyNoticeService` (owns `PrivacyNotice`: the version in force, the Owner's save, the public read) and the public `LegalController` (`GET /legal/notices/:clinicId`) |
| Notes, messages | `src/notes/`, `src/messages/` | B3: `GET /note-templates`, `GET`/`PUT /message-templates`. B6 and B9 add the notes and the queue |
| Outbox | `src/outbox/` | `OutboxService.enqueue(tx, …)` (the write side, inside the caller's transaction), `OutboxWorker` (claim, run, settle), `OutboxHandlers` (features register a handler per kind), `NoopHandler` |
| Scheduled jobs | `src/jobs/`, `src/<feature>/<feature>.jobs.ts` | `JobRunner.run(job, fn)` (the `JobLock` lease). Each `@Cron` lives in the module that owns its tables: `auth.jobs.ts` (session and rate-limit sweeps), `outbox.jobs.ts` (prune) |
| File storage | `src/storage/` | `StorageService` (clinic-scoped keys), `FileStorage` (the driver), `LocalDiskStorage`, and the `storage.delete` outbox handler (`delete-file.handler.ts`). Import `StorageModule` where files are kept |
| Demo seed | `src/seed/seed-database.ts`, `prisma/seed.ts` | Maps `@pedia/seed`'s `seedPlatform()` to rows |
| Features | `src/<name>/` | `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`. Same `<name>` as `apps/web/src/features/<name>` |
| Tests | `src/**/*.test.ts` (unit), `test/*.test.ts` (HTTP) | Run without a database, in `pnpm run check`. HTTP tests build the app with `test/support/test-app.ts`. `test/clinic-routes.test.ts` (B3), `test/patients-routes.test.ts` (B4) and `test/clinical-routes.test.ts` (B5) hold every route to "reaches a controller and the guard" (401 without a session); add a route there with its controller |
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
- Files go to object storage through presigned URLs, never through the API's memory.

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
- **`LocalDiskStorage` is per instance.** A multi-instance deployment needs B10's driver before files are uploaded.
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
- **The logo passes through the API's memory** (multer, at most 1 MB). B10's presigned uploads are for photos; don't
  raise `LOGO_RULES.maxBytes` without moving the logo to them.
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
- **The patient photo passes through the API's memory** (multer, at most 10 MB, JPEG/PNG/WebP only) until B10 moves it
  to presigned uploads.
- **A reminders "no" doesn't withdraw queued messages yet** (privacy #14): messages arrive with B9, which adds the
  withdrawal to `PatientWritesService.changeChoices`, in its transaction.
- **A database seeded before B4 has no patients**, and `db:seed` refuses a database with accounts: use a fresh volume or
  a new database, as for B3. The same for B5's visits and chart entries.
- **Lock before the first plain read.** MySQL's REPEATABLE READ takes the transaction's snapshot at its first plain
  (non-locking) read. A read before `lockPatient`/`lockAccount` would leave every later read blind to what the request
  that held the lock just committed: B5's plan read the visit first, and parallel corrections answered 500 and parallel
  completes all 200. Take the lock first (`lockPatientIfExists` when the 404 must come from something else), or make
  the first read a locking one (`SELECT … FOR UPDATE`, as `VisitsService.complete`). Race tests catch it.
- **Every visit and chart write locks the patient's row first** (`src/patients/patient-lock.ts`). `complete` locks the
  visit, then the patient; no path locks them the other way round.
- **In `hybrid`, notes, growth and photos on a visit the API started answer 404 from MSW** until B6/B10 (B5 decision 7).
  Seeded visits have the same ids on both sides and keep working.
- **A visit started from an appointment stores `appointmentId` unchecked** until B7, which checks and seats it in
  `VisitsService.start` and marks it done in `complete` (B5 decision 1). MSW's appointment stays "arrived" in `hybrid`.
- **A batch's chart entries share `recordedAt`**; `GET /patients/:id/chart` breaks the tie by id, not insertion order.
- `test/app.test.ts` logs a stack trace on purpose (the "unexpected error" case). It isn't a failure.

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
  rows pruned after 7 days (`OUTBOX_POLICY`, tuned in B9).
- **Scheduled jobs** (B1): `@nestjs/schedule`, started only with `background` (`BACKGROUND_WORK`). Each run takes a
  `JobLock` lease shorter than the job's period and keeps it after a successful run, so a second instance's tick
  skips; a failed run releases it.
- **Storage** (B1): keys are `clinics/<clinicId>/<area>/<uuid>.<ext>`, built and checked only by `StorageService`;
  another clinic's key reads as missing. The content type comes from an extension allowlist. Local disk until B10.
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
- **Archiving and bookings** (B3): `BranchesService.upcomingAt` is 0 until B7 brings appointments; B7 replaces it.
- **Audit** (B3): the mock's entries for staff writes (`Staff login`, `… (deactivated)`, `… (reactivated)`), in the
  write's transaction. Profile, branding and branch changes aren't audited, as in the mock.
- **Patients** (B4, decisions in `.claude/plans/feature-chunk-b4-patients-plan/decisions.md`):
  - **Search** is the mock's `matchesSearch` exactly (substring, every word, child and guardian names, phone digits only
    for `patients.contact`), as `LIKE '%word%'` over two stored columns built by the shared `patientSearchText`. A
    leading wildcard can't use an index, so a search scans one clinic's rows; full-text when a clinic passes ~10k.
  - **No column encryption** of medical fields: the disk is encrypted (B13).
  - **`/patient-summaries` and the header summary** are the API's now; last visit, recall date, balance and flags are
    empty or zero until B5, B7 and B8 fill them.
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
  - `lastVisitOn` is the shared rule over completed visits; B7 adds done appointments, the `recent_visit` filter and
    the `last_visit` sort.
  - Audit: the mock's names (`view` "Visits"/"Dental chart", `create` "Visit", `update` "Visit (completed)", `update`
    "Dental chart" once per request), written in the write's transaction.
- **Seed** (B1): `packages/seed` (`@pedia/seed`), so MSW and `prisma db seed` run the same `seedPlatform()`. Not
  `@pedia/shared`: the seed needs faker and is built from `new Date()`, which don't belong in the contract package.

---

## Reporting rules

The root `CONVENTIONS.md` → "Reporting rules" applies. Two more:

- **Not yet decided:** each chunk in [CHUNKS.md](CHUNKS.md) lists its open decisions under "Decide first". Settle them
  (grill-me or the architect) before building the chunk, then record the answer here.
- **"Ported" means the feature's handler tests pass against the API**, not that the endpoints exist.
