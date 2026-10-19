# Go-live checklist

Tick every line before real clinics' data goes in. Each line names how to check it.

## Account and access

- [ ] Root user has MFA and no access keys (IAM → Security credentials).
- [ ] You work as an IAM Identity Center administrator, not root.
- [ ] No IAM users or access keys exist for CI: `aws iam list-users` shows none for GitHub. Deploys use OIDC.
- [ ] The GitHub environment `production` is limited to `master`.

## Settings (`packages/infra/cdk.json`)

- [ ] `appEnv` = `production` and `demoLogins` = `false`. The API refuses `DEMO_LOGINS` with production; synth refuses
  it too.
- [ ] If the database ever held demo data (B13c's client demo, Q2), it is a fresh database now, not the demo one.
- [ ] `webOrigins` and `webUrl` are the real web addresses (https). `WEB_URL` drives texted invite and reset links
  (B11).
- [ ] `trustProxyHops` measured (first-time setup, step 10), not left at the default.

## Carried from B12

- [ ] **S3 covers `platform/*` as well as `clinics/*`.** Proof: in the operator console, upload the payment QR, then
  open it. Upload a clinic photo and open it.
- [ ] Semaphore account approved and the key stored (`semaphoreSecretArn`). Without it, texts go to the log driver
  only.
- [ ] Sender name **PRIMOLAR** approved by Semaphore, then `smsSenderName` = `PRIMOLAR`. Send one test recall text
  between 8 AM and 8 PM Manila.

## Health and alerts

- [ ] `https://<apiDomain>/api/health/ready` answers 200; `http://` answers 301.
- [ ] The alert email subscription is confirmed (SNS → Subscriptions: not "Pending confirmation").
- [ ] Each alarm reaches you. For each of `primolar-api-unhandled-errors`, `primolar-api-outbox-stuck` and
  `primolar-api-no-healthy-task`, run
  `aws cloudwatch set-alarm-state --alarm-name <name> --state-value ALARM --state-reason "go-live test"`. An email
  arrives, then an OK email at the next evaluation.
- [ ] CloudWatch → Metrics → `Primolar/API` shows `Requests`, `UnhandledErrors` and `OutboxOldestSeconds` (B13a's EMF
  lines arrive).
- [ ] Logs Insights → Saved queries → "Primolar errors by fingerprint" runs.
- [ ] The budget (Billing → Budgets → `primolar-monthly`) shows US$100 with two alerts.

## Data safety

- [ ] RDS: deletion protection on, backups kept 30 days, storage encrypted (RDS → the instance → Configuration and
  Maintenance & backups).
- [ ] A [restore drill](restore-drill.md) passed within the last 30 days, recorded in its table.
- [ ] Bucket: Block Public Access all on, versioning on (S3 → the bucket → Permissions, Properties).

## Web and the rest of B13

- [ ] Vercel production: `API_PROXY_TARGET` = `https://<apiDomain>`.
- [ ] Vercel production and preview: `NEXT_PUBLIC_API_MOCKING=disabled` (B13c1: no deployment runs MSW), then redeploy.
- [ ] `apps/web/e2e/api-demo-script.spec.ts` passes against the deployed demo (`E2E_BASE_URL=https://<demo web>`), right
  after a reset (B13's "Done when").
- [ ] The load test's local run is recorded (B13c1 implementation log), and its accepted misses are understood:
  the patient list and search slow down past ~1,000 patients; at 5,000, Today and booking miss their targets too
  (B13c1 decisions.md L1), until the "at scale" chunk.
- [ ] B13c2's Data Privacy Act items (export and deletion requests, retention, NPC registration) are done.
- [ ] The operator's password is strong and stored in a password manager. Two-step sign-in comes later (B13a D3).

## Known limits at go-live (accepted)

- No TLS between the API and RDS inside the VPC (decisions.md I5).
- A direct caller to `<apiDomain>` can choose the address the rate limits see (I11).
- Single-AZ database: an AZ outage means downtime until AWS recovers it (CHUNKS: Multi-AZ when downtime starts to
  cost).
