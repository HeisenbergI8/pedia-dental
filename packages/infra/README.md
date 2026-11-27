# packages/infra: Primolar on Google Cloud

Terraform for Google Cloud, in `asia-southeast1` (Singapore), in `terraform/`. The web stays on Vercel. The owner
applies it by hand; the `deploy` workflow never runs Terraform (it changes only images). Every Google Cloud step is
the owner's, never an agent's.

The decisions are in `.claude/plans/feature-gcp-migration-plan/` (`decisions.md`). The AWS CDK app this replaced
(B13b) is kept in git history under the tag `archive/aws-cdk`.

## What each file holds

| File | Holds |
| --- | --- |
| `versions.tf` | Terraform 1.9 or newer, the `google` and `random` providers, the state in a private, versioned Cloud Storage bucket (`<project id>-tfstate`, given at `init`) |
| `variables.tf` | Every setting and its rules. Values: `terraform.tfvars` (git-ignored), from `terraform.tfvars.example` |
| `apis.tf` | The Google APIs turned on, and the fixed names (`local.names`) the workflow and the runbooks use |
| `database.tf` | Cloud SQL MySQL 8.4 `primolar-db` (`db-f1-micro`, one zone), 30 daily backups and 7 days of point-in-time recovery, deletion protection, no authorized networks (only the Cloud SQL connector), slow-query log |
| `storage.tf` | The files bucket `<project id>-primolar-files` (private, versioned, old versions kept 35 days), its HMAC key's account `primolar-files`, the bucket's access logs |
| `secrets.tf` | Secret Manager, Singapore only: the generated database passwords, the origin secret, the HMAC key pair, and `primolar-semaphore` (its key added by hand) |
| `registry.tf` | Artifact Registry `primolar`: one image tag per commit, never overwritten, the 30 newest kept |
| `run.tf` | The Cloud Run service `primolar-api`: one instance always on (min 1, max 1), CPU always on, the Cloud SQL socket, the env and secrets, the probes on `/api/health/ready` and `/api/health/live` |
| `release.tf` | The Cloud Run job `primolar-release`: creates the app user, then `prisma migrate deploy`, as the master user |
| `monitoring.tf` | Log-based metrics on the API's metrics lines, six alert policies, the uptime check `primolar-api-ready`, the email channel, logs kept 90 days |
| `budget.tf` | The billing budget `primolar-monthly` (US$80; 80% actual, 100% forecast; credits excluded) |
| `deploy-identity.tf` | GitHub OIDC through Workload Identity Federation, and the deploy account `primolar-deploy` (this repository's `production` environment on `master` only; no stored key) |

## Commands

| Purpose | Command |
| --- | --- |
| Text tests of the `.tf` files and the workflows (part of `pnpm run check`; offline, no Terraform needed) | `pnpm --filter @pedia/infra test` |
| Format and validate (offline; CI's `terraform` job runs these too) | from `packages/infra/terraform`: `terraform fmt -check -recursive`, then `terraform init -backend=false` and `terraform validate` |
| See what a change would do (the owner) | from `packages/infra/terraform`: `terraform plan` |
| Apply it (the owner, by hand) | from `packages/infra/terraform`: `terraform apply` |

The first `terraform init` against the real state bucket is in first-time setup, section 4.

## Runbooks

1. [First-time setup](runbooks/first-time-setup.md): once per Google Cloud project.
2. [Deploy](runbooks/deploy.md): every release.
3. [Rollback](runbooks/rollback.md): when a release goes wrong.
4. [Restore drill](runbooks/restore-drill.md): monthly, and before go-live.
5. [Go-live checklist](runbooks/go-live-checklist.md).
6. [Clinic data return](runbooks/clinic-data-return.md): when a clinic leaves.

## Estimated monthly cost (an estimate, not a bill)

From Google Cloud list prices as known on 2026-11-27, for one clinic. **Not checked against the Google Cloud Pricing
Calculator:** check it there and against the first invoice. Not included: Vercel, Semaphore texts, the domain. The
budget (US$80) emails at 80% of actual spend and 100% of forecast.

| Item | Basis | US$/month (estimate) |
| --- | --- | --- |
| Cloud Run, 1 instance all month, 1 vCPU / 1 GiB, CPU always on (instance-based billing) | about 2.63 M vCPU-seconds + 2.63 M GiB-seconds, Singapore price tier | about 45 to 60 |
| Cloud SQL MySQL `db-f1-micro` (shared core), one zone | instance hours | about 9 to 12 |
| Cloud SQL 10 GB SSD + backups (30 daily, small) + binary logs | about US$0.20 per GB-month storage | about 3 to 5 |
| Cloud Storage, Standard, Singapore, a few GB + operations | | about 1 |
| Artifact Registry, up to 30 images (about 4 to 5 GB) | 0.5 GB free, then about US$0.10 per GB | about 0.5 |
| Secret Manager, about 6 secrets | 6 active versions free, then US$0.06 each | under 1 |
| Cloud Logging (under the 50 GiB free) + 60 extra days of retention | US$0.01 per GiB-month past 30 days | about 0 to 1 |
| Cloud Monitoring: 5 log-based metrics, 6 alert policies, 1 uptime check | inside the free allowances | about 0 |
| Network out (API answers to Vercel, file downloads) | a few GB | about 1 to 2 |
| **Total** | | **about 60 to 85** (about 40 to 55 if Cloud Run accepts 0.5 vCPU / 512 MiB) |

A restore drill adds under US$1 (a second small instance for an hour or two). **Until the billing account is
upgraded to paid, the free trial stops everything when it ends (2027-02-25).**
