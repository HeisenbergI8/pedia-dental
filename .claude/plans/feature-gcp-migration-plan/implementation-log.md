# Implementation log: move the backend from AWS to Google Cloud

Built 2026-11-27 by four parallel agents against decisions.md (owner: yes to all 15). Phases 1-5 (Terraform), 6-8 (API) and decision 11 (legal), 9 (retire CDK, deploy workflow), 10 (runbooks and docs). Coordinator fixes after the independent test: run.tf depends_on (Semaphore grant, database user), the clinic-data export guard for Cloud SQL socket URLs, stale AWS comments in env.ts and .env.example, *.auto.tfvars ignored. Independent checks: terraform 1.13.5 fmt and validate green; check 1,525 tests, test:int 712, Playwright 477 passed 0 failed, audit clean.

---

# Implementation log: Terraform (Phases 1–5)

Phases 1–5 of `feature-gcp-migration-plan.md`, built against `decisions.md`. Other phases (6–8, the API; 9–10) are
logged by their own implementers in `implementation-log.md`. Nothing here was run against Google Cloud.

**Terraform CLI:** not installed on this machine (`which terraform`: not found; no OpenTofu, no local terraform
image). So `terraform fmt -check` and `terraform validate` were **not run** for any phase. The HCL is checked as text
by the `tf-*` tests only, and was hand-formatted to `terraform fmt`'s alignment rules (an `=` chain breaks at a
comment line, a blank line or a line opening a multi-line value; consecutive trailing comments align). CI's
`terraform` job (Step 9.3) is the first real parse.

**Gate used per step:** the plan's Verify lines are `pnpm run check -- <filter>`. Two other agents are editing
`apps/api/*` and `packages/shared/src/domain/legal*` in this checkout, so the repo-wide `check` can go red for
reasons outside these phases. Each step was proved with the same filter, scoped to the package that owns the files:
`pnpm --filter @pedia/infra exec vitest run <filter>` plus `pnpm --filter @pedia/infra typecheck`. The repo-wide
`pnpm run typecheck` and the full infra test run close the work (end of this log).

## Phase 1: Terraform skeleton — 2026-11-27

**Steps completed:** 1.1, 1.2, 1.3, 1.4
**Files changed:** `packages/infra/terraform/versions.tf`, `packages/infra/terraform/variables.tf`,
`packages/infra/terraform/apis.tf`, `packages/infra/terraform/terraform.tfvars.example`,
`packages/infra/test/support/terraform.ts`, `packages/infra/test/tf-variables.test.ts`,
`packages/infra/test/tf-names.test.ts`, `.gitignore`
**Deviations from plan:**
- Step 1.1 says to run `terraform init` and commit `.terraform.lock.hcl` with `google` / `random` pinned to the
  newest 7.x / 3.x. Terraform is not installed and the task forbids downloading it, so **there is no lock file**.
  The constraints stay `~> 7.0` and `~> 3.6`. The owner's first `terraform init` (first-time setup) writes
  `.terraform.lock.hcl`; commit it then. (It is not git-ignored, so it will show as a new file.)
**Gate:** `test -f packages/infra/terraform/versions.tf` and `test -f …/terraform.tfvars.example`: both exist.
`pnpm --filter @pedia/infra exec vitest run tf-variables tf-names`: 2 files, 6 tests passed.
`pnpm --filter @pedia/infra typecheck`: clean.
**Notes:**
- `web_origins` in the example lists `https://ops.primolar.ph` too (the console's own host). The owner confirms it
  against the current Vercel settings at first setup (Phase 1 issues).
- `.gitignore` ignores `.claude/plans/*/*` except `implementation-log.md`, so **this log file
  (`implementation-log-terraform.md`) is git-ignored**. `.gitignore` was changed only for the Terraform rules the
  plan names; if this log should be tracked, the owner adds `!.claude/plans/*/implementation-log-terraform.md` or
  merges it into `implementation-log.md`.
- `terraform.tfvars.example` is not a file `terraform fmt` formats (only `.tf` / `.tfvars`), so its hand alignment
  is as the plan wrote it.

## Phase 2: Data — database, files, secrets, images — 2026-11-27

**Steps completed:** 2.1, 2.2, 2.3, 2.4
**Files changed:** `packages/infra/terraform/database.tf`, `packages/infra/terraform/storage.tf`,
`packages/infra/terraform/secrets.tf`, `packages/infra/terraform/registry.tf`, `packages/infra/test/tf-database.test.ts`,
`packages/infra/test/tf-storage.test.ts`, `packages/infra/test/tf-secrets.test.ts`, `packages/infra/test/tf-registry.test.ts`
**Deviations from plan:**
- `database.tf`, `backup_configuration`: the plan's trailing comments on `binary_log_enabled` / `start_time` /
  `transaction_log_retention_days` were not aligned the way `terraform fmt` aligns consecutive trailing comments.
  Whitespace only, so CI's `fmt -check` (Step 9.3) does not fail on it. No setting changed.
**Gate:** `pnpm --filter @pedia/infra exec vitest run <filter>` for each step: tf-database 5/5, tf-storage 4/4,
tf-secrets 3/3, tf-registry 2/2 passed. `pnpm --filter @pedia/infra typecheck`: clean.
**Notes (first apply, the owner confirms):**
- `db-f1-micro` with `MYSQL_8_4`: if Google refuses, set `database_tier = "db-g1-small"` (decisions 4). Never 8.0.
- `ssl_mode = "TRUSTED_CLIENT_CERTIFICATE_REQUIRED"`: if the first release job can't connect over the built-in
  Cloud Run connection, fall back to `ENCRYPTED_ONLY` (still no authorized networks) and record it here.
- The master user (`google_sql_user`) must be able to `CREATE USER` / `GRANT` for the release job's app-user setup
  (#34). If not, keep `api_database_user = "master"` until fixed.
- Generated passwords and the HMAC secret live in Terraform state: the state bucket must be private to the owner.
- Files through the S3-compatible API stay unproved until the first-time setup upload (decisions 7).

## Phase 3: Cloud Run service and release job — 2026-11-27

**Steps completed:** 3.1, 3.2
**Files changed:** `packages/infra/terraform/run.tf`, `packages/infra/terraform/release.tf`,
`packages/infra/test/tf-run.test.ts`, `packages/infra/test/tf-release.test.ts`
**Deviations from plan:**
- `release.tf` locals: the plan padded `app_user     =` to line up with `app_grants` / `app_user_sql`, but the comment
  line between them ends `terraform fmt`'s alignment group, so fmt writes `app_user =`. Written the fmt way.
  Whitespace only.
**Gate:** `pnpm --filter @pedia/infra exec vitest run tf-run`: 6/6 passed; `… vitest run tf-release`: 4/4 passed.
`pnpm --filter @pedia/infra typecheck`: clean.
**Notes:**
- Checked against the tree: every plain and secret env name the service sets is read by `apps/api/src/config/env.ts`
  (including `SHUTDOWN_GRACE_MS`, Phase 7's, already present in the working tree); the image's command
  (`node --enable-source-maps dist/main.mjs`, port 4100) matches `apps/api/Dockerfile`; both probe paths are in
  `OPEN_PATHS` (`apps/api/src/origin-check.ts`, the test reads it); the release SQL is `appUserSetup` from
  `service-stack.ts` word for word.
- The `?socket=` URL needs Phase 6 (`databaseConfig`) before the first **deploy**, not to compile.
- First apply order (Step 10.1): `-target` the registry, push one image by hand, then apply all with
  `-var initial_image_tag=<sha>`. With the default `""` the image reference is invalid, so a full first apply
  without it fails.
- First deploy with `api_database_user = "master"`; after the release job has run once, `"app"` and apply again.
- `TRUST_PROXY_HOPS = 2` is inferred, not measured: go-live is blocked until it is (decisions 15).
- `api_cpu = "0.5"` with `cpu_idle = false` may be refused by Cloud Run; the default stays `"1"` (decisions 4).

## Phase 4: Alerts, logs and the budget — 2026-11-27

**Steps completed:** 4.1, 4.2, plus one addition (below)
**Files changed:** `packages/infra/terraform/monitoring.tf`, `packages/infra/terraform/budget.tf`,
`packages/infra/test/tf-monitoring.test.ts`, `packages/infra/test/tf-budget.test.ts`
**Deviations from plan:**
- **Addition (asked for by the coordinator mid-phase, not in the plan):** a fifth alarm, the twin of AWS's
  `primolar-texts-held-daily-cap` (`service-stack.ts`, Sum over 1 min > 0, missing data not breaching, no OK action).
  Another session added the EMF field `TextsHeldDailyCap` to the api totals line (`MetricsService.countTextHeld()`,
  present in `apps/api/src/metrics/metrics.service.ts`). Modelled exactly like the console sign-in alert: a
  `texts_held` entry in `local.log_metrics` (`jsonPayload.TextsHeldDailyCap>0`, metric `primolar/texts-held`) and in
  `local.line_alerts` (name `primolar-texts-held-daily-cap`, window `60s`, `prompts = ["OPENED"]`, the coordinator's
  description). A threshold condition with no data never fires, which is AWS's "not breaching". The comment over
  `line_alerts` now names both no-"closed"-email alerts. `tf-monitoring.test.ts` checks the field exists in
  `metrics.service.ts`, the filter, and the alert's name, window and opened-only prompts (one new test, two
  extended). The plan's tables (1.1, the alarm map in 4.1, "5 alert policies" in 1.2) still say four alarms /
  five policies; it is now six policies (still inside Cloud Monitoring's free allowance).
**Gate:** `pnpm --filter @pedia/infra exec vitest run tf-monitoring`: 6/6 passed; `… vitest run tf-budget`: 3/3
passed. `pnpm --filter @pedia/infra typecheck`: clean.
**Notes (first apply, the owner confirms):**
- The log line shape is assumed: the EMF fields at the top level of `jsonPayload`. Step 10.1's "Prove the alerts"
  checks it; if they are nested, only `local.log_metrics`' filters change.
- An alert policy created in the same apply as its log-based metric can be refused while the metric descriptor
  propagates; a second `terraform apply` settles it.
- Budget: US$80 in `USD` (decisions 8). The owner needs Billing Account Administrator or Costs Manager on the
  billing account, and the quota project is set in `versions.tf`.

## Phase 5: GitHub deploy identity — 2026-11-27

**Steps completed:** 5.1
**Files changed:** `packages/infra/terraform/deploy-identity.tf`, `packages/infra/test/tf-deploy-identity.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm --filter @pedia/infra exec vitest run tf-deploy-identity`: 3/3 passed.
`pnpm --filter @pedia/infra typecheck`: clean.
**Notes:**
- `roles/run.viewer` at project level is kept as planned (read-only, for `gcloud … --wait` polling). If the first
  deploy shows the resource-level roles are enough, drop it and its test line and record it here.
- GitHub's `production` environment variables become `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`
  (output `github_workload_identity_provider`) and `GCP_DEPLOY_SERVICE_ACCOUNT` (output
  `github_deploy_service_account`); Step 10.1 tells the owner.

## Closing gates — 2026-11-27

- `pnpm --filter @pedia/infra exec vitest run tf-`: **11 files, 42 tests, all passed** (the Phase 1–5 tests).
- `pnpm --filter @pedia/infra test` (the whole infra package): **16 of 17 files, 98 of 99 tests passed. 1 failed,
  not from these phases:** `test/service-stack.test.ts` › "carries the RDS CA bundle where the image puts it (#15)"
  (old CDK test). It fails because Phase 8.1 (another agent) already removed the RDS CA bundle from
  `apps/api/Dockerfile` in the working tree. That CDK test is deleted in Phase 9.1, so it is red until Phase 9
  lands. Not touched here (outside Phases 1–5's files).
- `pnpm run typecheck` (every workspace package): **passed**, exit 0.
- `terraform fmt -check` / `terraform validate`: **not run**, Terraform is not installed.

---

# Implementation log: API side (Phases 6–8, decision 11)

Kept apart from `implementation-log.md` because another agent was writing Phases 1–5 (`packages/infra/*`,
`.gitignore`) in the same checkout at the same time.

## Phase 6: API — Cloud SQL socket — 2026-11-27

**Steps completed:** 6.1
**Files changed:** `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/database-config.test.ts`
**Deviations from plan:** The Verify line `pnpm run check -- database-config` was run as its scoped parts
(`pnpm --filter api typecheck`, `pnpm --filter api exec vitest run src/prisma/database-config`): the root `check`
runs every package's tests, including `packages/infra`, which the other agent was editing. Code as in the plan's diff.
**Gate:** `vitest run src/prisma/database-config`: 1 file, 6 tests passed (4 existing + 2 new).
**Notes:** A URL without `socket` takes exactly the old path; the RDS cases pass unchanged.

## Phase 7: API — shutdown timing — 2026-11-27

**Steps completed:** 7.1, 7.2
**Files changed:** `apps/api/src/config/env.ts`, `apps/api/src/config/env.test.ts`, `apps/api/src/main.ts`,
`apps/api/src/health/readiness.ts`
**Deviations from plan:**
- Verify line run scoped, as in Phase 6 (`vitest run src/config/env.test`, then `pnpm run typecheck`).
- `apps/api/CONVENTIONS.md` says a new variable goes in `Env`, `.env.example` and `.env`. `.env.example` was not
  touched: it is outside this task's file list, and the variable has a default (12000) so local runs need nothing.
  Phase 10 (or the owner) can add a commented `SHUTDOWN_GRACE_MS` line there.
- `env.ts` already carried the user's own uncommitted `SMS_DAILY_PARTS_MAX` lines (text-abuse work). They were left
  as they were; the Phase 7 edits are targeted and sit beside them, so the file's diff mixes both.
**Gate:** `vitest run src/config/env.test`: 16 tests passed. `pnpm run typecheck`: green across all five packages
(at the first run it failed only in `apps/api/test/int/portal.int.test.ts`, a file being edited concurrently outside
this task; it was green on the final run).
**Notes:** `config/env.ts` now imports `SHUTDOWN_GRACE_MS` from `health/readiness.ts`; readiness imports only
`@nestjs/common`, so no cycle, and `apps/api/CONVENTIONS.md` has no rule against it. The CDK test's regex
`SHUTDOWN_GRACE_MS = ([\d_]+)` still finds only the `export const` line.

## Phase 8: Image and API hand-off notes — 2026-11-27

**Steps completed:** 8.1, 8.2
**Files changed:** `apps/api/Dockerfile`, `apps/api/README.md`
**Deviations from plan:** none in the edits. **Plan gap found:** `packages/infra/test/service-stack.test.ts`
lines 61–64 ("carries the RDS CA bundle where the image puts it (#15)") reads `apps/api/Dockerfile` and expects the
removed `ADD https://truststore.pki.rds.amazonaws.com/...` line. The plan's Phase 8 issues list missed it (it names
only `config.ts` and the runbook). With Step 8.1 in place that infra test fails until Phase 9 deletes the CDK tests.
That matters for decision 10 (Phases 1–8 pushed first, AWS code still in place): the first push would be red in
`@pedia/infra` unless the infra-side agent drops or skips that one test in its phase, or Step 8.1 moves to the second
push. Not fixed here: `packages/infra/*` belongs to the other agent.
**Gate:** unverifiable locally for the image (no Docker; CI's `image` job proves it). `grep` shows no RDS, ECS, CDK
or B13b reference left in the Dockerfile or the README. `pnpm run typecheck` green.
**Notes:** `databaseConfig` keeps `sslcert` support, so a network TLS database still works with a CA file mounted at
run time.

## Decision 11: legal host wording — 2026-11-27

**Files changed:** `packages/shared/src/domain/legal.ts`, `packages/shared/src/domain/legal.test.ts`
**Change:** `HOSTING` now reads "Records are stored with Google Cloud (Google Asia Pacific Pte. Ltd.) in Singapore, and
the website is served by Vercel, under contracts that require protection equal to the Data Privacy Act's." Every
document stays at version 1. The test's hosting check now expects "Google Cloud (Google Asia Pacific Pte. Ltd.) in
Singapore" in the DPA and the Privacy Policy.
**Deviations:** none. `apps/web/e2e` (and the rest of the repo outside `.claude/`) has no assertion of the old
wording, so nothing else changed.
**Gate:** `pnpm --filter @pedia/shared test`: 33 files, 301 tests passed.

## Final gates — 2026-11-27

- `pnpm run typecheck`: green (shared, infra, seed, api, web).
- `pnpm --filter @pedia/shared test`: 33 files, 301 tests passed.
- `pnpm --filter api test`: 100 of 101 files, 651 of 653 tests passed. The 2 failures are in
  `test/port-ledger.test.ts` and name `allowances.test.ts` cases (the user's uncommitted text-abuse-limits work in
  `apps/web/src/mocks/allowances*.ts` and `apps/api/test/int/allowances.int.test.ts`). None of this task's files is
  involved.

---

# Implementation log: Phase 9 (retire the CDK app; the new deploy workflow)

## Phase 9: Retire the CDK app; the new deploy workflow — 2026-11-27

**Steps completed:** 9.1, 9.2, 9.3 (done in one sitting, as the plan asks: 9.1 breaks the old deploy test until 9.2)
**Files deleted:** `packages/infra/bin/app.ts`, `packages/infra/src/{config,foundation-stack,primolar,service-stack}.ts`,
`packages/infra/policies/cfn-execution.json`, `packages/infra/cdk.json`,
`packages/infra/test/{app,config,foundation-stack,service-stack,cfn-execution-policy}.test.ts`,
`packages/infra/test/support/{stacks,settings}.ts`, the now-empty `bin/`, `src/`, `policies/` folders, and the build
output `packages/infra/cdk.out/` (untracked).
**Files changed:** `packages/infra/package.json` (0.2.0, no CDK/zod/tsx, `tf:fmt` / `tf:validate` scripts),
`packages/infra/tsconfig.json` (`include: ["test", "vitest.config.mts"]`), `packages/infra/vitest.config.mts` (no
synthesis timeouts), `.github/workflows/deploy.yml` (rewritten for Artifact Registry and Cloud Run, as in 9.2),
`.github/workflows/api.yml` (fourth job `terraform`), `packages/infra/test/deploy-workflow.test.ts` (replaced),
`packages/infra/test/ci-workflow.test.ts` (new), `pnpm-lock.yaml`.
**Deviations from plan:**
- The action SHAs for `google-github-actions/auth` (v3.0.0), `google-github-actions/setup-gcloud` (v3.0.1) and
  `hashicorp/setup-terraform` (v3.1.2) are the plan's (read 2026-11-27). Not re-checked with `git ls-remote`: this
  session was told to run nothing against GitHub. The owner or coordinator should confirm them before the first run.
  The other pins (checkout, buildx, build-push) are the ones already in `api.yml`.
- Verify lines `pnpm run check -- deploy-workflow` / `-- ci-workflow` were run as
  `pnpm --filter @pedia/infra exec vitest run deploy-workflow ci-workflow` (the root `check` script does not pass a
  filter through to one package), and the full `pnpm run check` was run for 9.1.
- `service-stack.ts` and `service-stack.test.ts` held another session's uncommitted TextsHeldDailyCap alarm (staged
  in the index). Deleted with the stack, as agreed; its Google twin is in `terraform/monitoring.tf`. The index still
  holds that staged version until the coordinator stages the deletion.
- The archive tag `archive/aws-cdk` (decision 9) is not made here: the coordinator makes it at commit time.
**Gate:**
- `pnpm --filter @pedia/infra exec vitest run deploy-workflow ci-workflow`: 2 files, 10 tests passed.
- `pnpm --filter @pedia/infra test`: 13 files, 52 tests passed (11 `tf-*` files from Phases 1–5 plus the 2 workflow files).
- `pnpm run typecheck`: exit 0 (every package).
- `pnpm run check`: exit 0. infra 52, shared 301, seed 31, web 488, api 653 tests, all passed.
- `pnpm run audit:deps` (`pnpm audit --prod --audit-level high`): no known vulnerabilities, exit 0.
- `terraform fmt -check` / `validate`: not run (Terraform not installed); the new CI `terraform` job runs them.
**Lockfile:** `pnpm install` removed only `aws-cdk-lib@2.273.0`, `aws-cdk@2.1145.0`, `constructs@10.8.1` and the three
`@aws-cdk/*` assets, plus infra's importer entries for those and `zod`/`tsx`. `tsx@4.23.15` and `esbuild@0.28.2`
stay at the same versions, now marked `optional: true` (only reachable as optional peers). No other version moved
(2 insertions, 73 deletions).
**Notes:**
- Docs still naming `cdk synth` / `cdk diff` (`CONVENTIONS.md`, `packages/infra/README.md`, runbooks) are Phase 10's,
  being rewritten by another agent.
- GitHub `production` environment variables needed before the first run: `GCP_PROJECT_ID`,
  `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`; remove `AWS_DEPLOY_ROLE_ARN` (Step 10.1).

---

# Implementation log: Phase 10 (runbooks and docs)

Built against `decisions.md`, the Phase 9 design in the plan (the new `deploy.yml` was being written by another agent
at the same time), and the real names in `packages/infra/terraform/*`. Nothing was run against Google Cloud.

## Phase 10: Runbooks and docs — 2026-11-27

**Steps completed:** 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, plus the commented `SHUTDOWN_GRACE_MS` line in
`apps/api/.env.example` (Phase 7's helper skipped it).

**Files changed:** `packages/infra/runbooks/{first-time-setup,deploy,rollback,restore-drill,go-live-checklist,clinic-data-return}.md`,
`packages/infra/README.md`, `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `README.md`, `PRIVACY_OPERATIONS.md`,
`apps/api/.env.example` (one line).

**Kept from other sessions' work:**
- Semaphore: the PRIMOLAR approval (up to 5 business days), "a key without an approved sender name makes every send
  fail", the fresh-key note (the first key was seen in screenshots on 2026-11-27), and the go-live Semaphore lines
  (real delivery to the owner's phone, no "test" texts, full links, credits). The key now goes to Secret Manager
  `primolar-semaphore` (`read -rs`, so it stays out of shell history), then `semaphore_enabled = true` and
  `sms_sender_name = "PRIMOLAR"` in one apply. Added: never set `semaphore_enabled` before the key version exists (the
  revision cannot start).
- `CONVENTIONS.md` Domain rules: the text-limits paragraph is untouched ("the `TextsHeldDailyCap` alarm emails" stays
  true: `primolar-texts-held-daily-cap`).
- Operator console: `ops.primolar.ph` via Vercel `OPS_HOST`, `app.primolar.ph/operator` answers 404, every console
  sign-in emails `alerts@primolar.ph` (`primolar-console-sign-in`; sign-ins a minute or two apart share one email).
- The owner's gates from `decisions.md`: billing upgrade before go-live (setup 0.4 and the checklist's first line),
  `TRUST_PROXY_HOPS` measured before go-live (setup 12, checklist), the S3-compatible upload proof before clinic data
  (setup 10), `API_PROXY_TARGET` = the `run.app` address (setup 9), `primolar-release` gets the HMAC secrets only per
  export (clinic-data-return 3.2 and 3.5).

**Deviations from plan:**
1. **`--args` without `-c`.** The plan's rollback command was `--args="-c,export ..."`. The release job's container
   already has `command = ["sh", "-c"]` (`release.tf`), and `--args` replaces only the args, so a leading `-c` would
   run `sh -c -c <script>`. The runbooks pass the script alone, as `--args='^##^<script>'` (single quotes so the
   owner's shell does not expand `$DB_USER`; `^##^` so gcloud does not split at commas). The clinic export reads the
   script from a file (`--args="^##^$(cat export-command.sh)"`) because it contains both quote kinds.
2. **Clinic export: the HMAC secrets and the memory are set with `gcloud run jobs update`, not `jobs execute`.**
   The plan put `--update-secrets` on `jobs execute`; as far as I know `execute` overrides only args, env vars,
   tasks and the timeout, not secrets or memory. So the runbook grants the two secrets, adds the env, secrets and
   memory with `jobs update`, runs `execute --args`, then removes them all with `jobs update --remove-env-vars
   --remove-secrets --memory 512Mi` and `remove-iam-policy-binding`, and checks `terraform plan` shows "No changes".
   The export upload also sets `requestChecksumCalculation:'WHEN_REQUIRED'`, as `apps/api/src/storage/file-storage.ts`
   does for S3-compatible stores.
3. **Operator two-step enrolment runs locally through `cloud-sql-proxy`, not as a job execution.** On AWS the runbook
   deleted the CloudWatch log stream that held the otpauth secret. Cloud Logging cannot delete one entry, so a job
   would leave the secret in the logs for 90 days. The runbook runs `pnpm --filter api db:operator-totp <email>` with
   a `DATABASE_URL` to `127.0.0.1:3310` (the proxy) as the master user. `loadScriptEnv` forces
   `BACKGROUND_WORK=false`, so the local process runs no jobs against production.
4. **Restore drill check:** kept the AWS drill's own query and pass rules (clinics, patients, last audit, migrations)
   rather than the plan's Patient/Payment/OutboxMessage counts, run with `mysql` through two proxies. Added the
   `--no-deletion-protection` patch in case a clone copies the protection, and the macOS form of "yesterday 15:00 UTC".
5. **A real restore:** added `gcloud run jobs update` for the release job's socket (not only the service's), a
   warning not to `terraform apply` until Terraform is moved to the copy (it would move the service back), the
   `terraform state rm` / `import` ids, and the matching change in `packages/infra/test/support/terraform.ts`
   (`tf-names.test.ts` compares `sql_instance`).
6. **Rollback by traffic:** added that while traffic is pinned to one revision, a later `services update` creates a
   revision with no traffic, so `update-traffic --to-latest` must run before the next deploy. The image-tag rollback
   is the usual way.
7. **Go-live alerts:** Cloud Monitoring has no "set alarm state" like CloudWatch, so the checklist proves the email
   channel with the console sign-in email and checks the six policies and the uptime check are listed and enabled.
   Six, not the plan's five: Phase 4 added `primolar-texts-held-daily-cap`. The README cost row says 5 log-based
   metrics and 6 policies for the same reason.
8. **Clinic handover link:** `gcloud storage sign-url --impersonate-service-account=primolar-files@...` with a
   temporary `roles/iam.serviceAccountTokenCreator` for the owner on that account, removed straight after. The plan
   did not cover section 5's presigned link.
9. Ranges are written "10 to 15", not with dashes, in the runbooks and the package README (the owner's English rule:
   no em dashes).

**Gate:** docs only; no Verify line (plan Phase 10). `pnpm run typecheck`: green. `pnpm --filter api exec vitest run
src/privacy/inventory src/logging/logger` (the tests that read `PRIVACY_OPERATIONS.md` and the logged
`x-forwarded-for` the hops measurement relies on): 2 files, 25 tests passed. AWS-terms grep over the changed files:
only intentional mentions remain (the `archive/aws-cdk` tag and history in `packages/infra/README.md` and
`apps/api/CONVENTIONS.md`, "delete `AWS_DEPLOY_ROLE_ARN`", "the legal documents name Google Cloud, not AWS", "RDS kept
30 days" in the accepted limits, "decided as Amazon S3 in B10", and the `@aws-sdk/client-s3` package name).

**Notes for the owner and the auditor:**
- Every `gcloud` command is written from documented flags and is unproven until first-time setup runs it. Fix the
  runbook in the moment a flag has changed.
- **Found, not fixed (code, outside this phase):** `apps/api/prisma/clinic-data.ts` line 28 refuses an export without
  `S3_BUCKET` only when the database URL is not local, testing `/@(localhost|127\.0\.0\.1)[:/]/`. The Cloud SQL socket
  URL is `...@localhost/primolar?socket=...`, so the guard no longer fires in production: a forgotten step 3.3 would
  export with every file in `missing` instead of refusing. The runbook says to check `missing`; the regex should also
  treat `?socket=` as remote.
- `apps/api/.env.example` still has AWS wording on other lines (the `TRUST_PROXY_HOPS` "1 behind the ALB" comment,
  "CloudWatch metrics lines", "Amazon S3 (production: ap-southeast-1)", "an IAM role in production"). Only the
  `SHUTDOWN_GRACE_MS` line was in scope.
- `.gitignore` ignores `.claude/plans/*/*` except `implementation-log.md`, so this file is git-ignored too (as the
  other two logs are).
