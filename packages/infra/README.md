# packages/infra: Primolar on AWS (B13b)

AWS CDK v2 in TypeScript. Two stacks in `ap-southeast-1`:

| Stack | Holds | Deployed by |
| --- | --- | --- |
| `PrimolarFoundation` | VPC (no NAT), files bucket, ECR `primolar-api`, RDS MySQL 8.4, the certificate, the alert topic, the budget, the GitHub deploy role | you, by hand: `cdk diff` then `cdk deploy PrimolarFoundation` |
| `PrimolarService` | ECS cluster `primolar`, services `api` (background work) and `api-web`, the release task, the HTTPS load balancer, logs, alarms | the `deploy` workflow (Actions → deploy) |

Settings live in `cdk.json` → `context` (no secrets). Their rules are in `src/config.ts`; the decisions behind them
are in `.claude/plans/feature-chunk-b13b-aws-infra-plan/decisions.md`.

## Commands (from the repository root)

| Purpose | Command |
| --- | --- |
| Tests and offline synthesis (part of `pnpm run check`) | `pnpm --filter @pedia/infra test` |
| Synthesize with your settings (no AWS access needed) | `pnpm --filter @pedia/infra exec cdk synth -q` |
| See what a deploy would change | `pnpm --filter @pedia/infra exec cdk diff PrimolarFoundation` (or `PrimolarService`) |
| Deploy the foundation (by hand) | `pnpm --filter @pedia/infra exec cdk deploy PrimolarFoundation` |

## Runbooks

1. [First-time setup](runbooks/first-time-setup.md): once per AWS account.
2. [Deploy](runbooks/deploy.md): every release.
3. [Rollback](runbooks/rollback.md): when a release goes wrong.
4. [Restore drill](runbooks/restore-drill.md): monthly, and before go-live.
5. [Go-live checklist](runbooks/go-live-checklist.md).

## Estimated monthly cost (estimate, not a bill)

From AWS's public list prices for Singapore in October 2026, for one task running all month. Not included: free-tier
credits, Vercel, Semaphore texts, the domain. Check it against the AWS Pricing Calculator and your first bill. The
budget alert (US$100) emails at 80% of actual and 100% of forecast.

| Item | Basis | US$/month |
| --- | --- | --- |
| ECS Fargate: 1 task, 0.5 vCPU / 1 GB, x86, all month | ~$0.0506 per vCPU-hour, ~$0.0055 per GB-hour | ~22 |
| Application Load Balancer | ~$0.0252 per hour + about 1 LCU | ~24 |
| RDS MySQL `db.t4g.micro`, single-AZ | ~$0.026 per hour | ~19 |
| RDS gp3 storage, 20 GB (backups up to the database's size are free) | ~$0.138 per GB | ~3 |
| Public IPv4 addresses: the load balancer's 2 and the task's 1 | $0.005 per hour each | ~11 |
| CloudWatch: ~10 custom metrics (B13a E6), 3 alarms, 1–2 GB of logs | | ~5 |
| Secrets Manager: 1–2 secrets | $0.40 each | ~1 |
| S3, ECR (up to 30 images), data out | small at pilot volume | ~3 |
| **Total** | | **~88** |

Each extra `api-web` task adds about US$26 (task and IPv4). A restore drill adds under US$1 (a second micro instance
for an hour or two).
