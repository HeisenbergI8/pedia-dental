# Go-live checklist

Tick every line before real clinics' data goes in. Each line says how to check it. "Setup section N" means
[first-time setup](first-time-setup.md), section N.

## Account and access

- [ ] **The billing account is upgraded to paid** (Console → Billing: no "Free trial" banner). A trial account stops
  every resource when the trial ends (2027-02-25) or the credit runs out.
- [ ] Your Google account has two-step sign-in on.
- [ ] Only you have the Owner role on the project (Console → IAM & Admin → IAM). No user has a service account key:
  Console → IAM & Admin → Service accounts → each `primolar-*` account → Keys is empty.
- [ ] The state bucket `gs://<project id>-tfstate` is private: nobody but you has a Storage role on the project, and
  `gcloud storage buckets describe gs://<project id>-tfstate` shows `public_access_prevention: enforced`.
- [ ] The GitHub environment `production` is limited to `master`, and has the three `GCP_*` variables, no
  `AWS_DEPLOY_ROLE_ARN` and no Google key (setup section 7).

## Settings (`packages/infra/terraform/terraform.tfvars`)

- [ ] `app_env = "production"` and `demo_logins = false`. Terraform refuses `demo_logins` with production; the API
  refuses it too.
- [ ] If the database ever held demo data (B13c's client demo), it is a fresh database now, not the demo one.
- [ ] `web_origins` and `web_url` are the real web addresses (https). `WEB_URL` drives texted invite and reset links
  (B11).
- [ ] `api_database_user = "app"` (setup section 8): the service signs in as `primolar_app` (SELECT, INSERT, UPDATE,
  DELETE only).
- [ ] **`trust_proxy_hops` measured** (setup section 12), not left at the default. Go-live waits for this.
- [ ] `terraform plan` shows "No changes": what runs is what the files say.

## Carried from B12

- [ ] **The files bucket covers `platform/*` as well as `clinics/*`.** Proof: in the operator console, upload the
  payment QR, then open it. Upload a clinic photo and open it.
- [ ] Sender name **PRIMOLAR** approved by Semaphore (Account → Sender Names shows it approved). Only then store the
  key in Secret Manager (`primolar-semaphore`) and set `semaphore_enabled = true` and `sms_sender_name = "PRIMOLAR"`,
  in the same apply (setup section 14). Without an approved sender name Semaphore errors on every send and the driver
  marks every text refused. Without the key, texts go to the log driver only.
- [ ] Send one recall text between 8 AM and 8 PM Manila to your own phone. It must arrive, not just show "Sent":
  Semaphore's "sent" means handed to the network, not delivered.
- [ ] No text starts with the word "test" (any case): the networks drop those silently. Check clinic templates and
  your own trial text.
- [ ] Every link in a text is a full `https://` address on the real domain. Smart silently blocks shortened links
  (bit.ly and the like). The app builds links from `WEB_URL`, so this holds as long as nobody adds a shortener.
- [ ] Credits topped up, and you know the balance (Semaphore dashboard). Texts with a link usually cost 2 credits
  (153 characters per part past 160). Credits expire 12 months after the last top-up.

## Health and alerts

- [ ] The origin lock works (setup section 11): straight to the `run.app` address, `/api/auth/me` answers 403 and
  `/api/health/ready` answers 200; through `https://app.primolar.ph`, `/api/auth/me` answers 401.
- [ ] The web works through its proxy: sign in on the web once (a 403 there means Vercel's `ORIGIN_SECRET` is
  missing or stale).
- [ ] The alert email reaches `alerts@primolar.ph`: the `primolar-console-sign-in` email arrived after a console
  sign-in (setup section 13).
- [ ] The metrics lines arrive: Logs Explorer finds `jsonPayload.Requests` lines every 60 seconds (setup section 13).
- [ ] Monitoring → Alerting lists the six policies (`primolar-api-unhandled-errors`, `primolar-api-outbox-stuck`,
  `primolar-api-outbox-silent`, `primolar-api-not-ready`, `primolar-console-sign-in`,
  `primolar-texts-held-daily-cap`), all enabled, each sending to the "Primolar alerts" email channel.
- [ ] Monitoring → Uptime checks: `primolar-api-ready` is green from every region.
- [ ] The errors-by-fingerprint search runs ([deploy](deploy.md), "Errors by fingerprint").
- [ ] Billing → Budgets & alerts → `primolar-monthly` shows US$80 with two alerts (80% actual, 100% forecast).

## Data safety

- [ ] Cloud SQL `primolar-db`: deletion protection on, 30 daily backups, point-in-time recovery on (Console → SQL →
  `primolar-db` → Overview and Backups). `gcloud sql backups list --instance primolar-db` lists at least one backup.
- [ ] A [restore drill](restore-drill.md) passed within the last 30 days, recorded in its table.
- [ ] Files bucket `<project id>-primolar-files`: public access prevention enforced, versioning on (Console → Cloud
  Storage → the bucket → Configuration and Protection).
- [ ] The files bucket was proved with a real upload, open, download and delete (setup section 10).
- [ ] Logs are kept 90 days (Logging → Log storage → `_Default`), and the files bucket's access logs arrive (Logs
  Explorer, `protoPayload.serviceName="storage.googleapis.com"`).
- [ ] Storage encryption uses Google-managed keys. A customer-managed key would need a new Cloud SQL instance and is
  planned after launch. Document this in the Data Privacy Act records.

## Web and the rest of B13

- [ ] Vercel production: `API_PROXY_TARGET` = the `run.app` address (`terraform output -raw api_url`, no trailing
  slash), and `ORIGIN_SECRET` (Sensitive) = the value of `primolar-origin-secret` (setup section 9).
- [ ] Vercel production and preview: `NEXT_PUBLIC_API_MOCKING=disabled` (B13c1: no deployment runs MSW), then
  redeploy.
- [ ] The legal documents (DPA and privacy notice) name Google Cloud in Singapore as the host, not AWS.
- [ ] `apps/web/e2e/api-demo-script.spec.ts` passes against the deployed demo (`E2E_BASE_URL=https://<demo web>`),
  right after a reset (B13's "Done when").
- [ ] The load test's local run is recorded (B13c1 implementation log), and its accepted misses are understood:
  the patient list and search slow down from a few hundred patients (p97.5 683 to 819 ms at about 560, B13c1 tester);
  at 5,000, Today and booking miss their targets too (B13c1 decisions.md L1), until the "at scale" chunk.
- [ ] B13c2's Data Privacy Act items (export and deletion requests, retention, NPC registration) are done.
- [ ] The operator's password is strong and stored in a password manager, and the operator is enrolled in two-step
  sign-in (setup section 17): production refuses an operator without it.
- [ ] The console opens only at `https://ops.primolar.ph` (`OPS_HOST`): `https://app.primolar.ph/operator` answers
  404, and signing in to the console emails `alerts@primolar.ph` within a few minutes (`primolar-console-sign-in`).

## Known limits at go-live (accepted)

- **One API instance** (min 1, max 1). There is no second instance to fail over to. If it crashes, Cloud Run starts
  a new one.
- **Cloud SQL `db-f1-micro` is shared-core and has no SLA.** One zone only: a zone outage means downtime until Google
  recovers it. `db-g1-small` or a high-availability instance when downtime starts to cost.
- **Point-in-time recovery covers 7 days**, plus 30 daily backups (RDS kept 30 days of point in time).
- **No WAF** (no Cloud Armor, no load balancer) for one clinic. Every request passes Vercel, the API refuses anything
  without the origin secret, and its own sign-in limits stay. Look again at three or more clinics.
- **The origin lock is one layer: the API.** Refused requests still reach the instance. The origin secret is readable
  by anyone allowed to read Secret Manager in the project, and it is in Terraform's state. Rotation: setup section 15.
- **The files key is stored** (an HMAC key in Secret Manager and in Terraform's state). Rotation: setup section 16.
  A native Cloud Storage driver without a stored key is a later plan.
- Storage encryption (Cloud SQL, Cloud Storage) uses Google-managed keys, and no field is encrypted by the
  application. A customer-managed key is planned after launch.
