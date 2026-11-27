# First-time setup (once per Google Cloud project)

You run every step here. Nothing here runs from CI, and no agent runs it. Plan about two hours; most of it is
waiting for Google.

**Where to run commands.** Each section has a **Where** line:

- "repository root" = the `pedia-dental` folder.
- "terraform folder" = `packages/infra/terraform` (`cd packages/infra/terraform` from the repository root).

In the commands, replace `<project id>` with your Google Cloud project id (the id, not the name or the number).

**Not run yet.** These commands come from Google's documented flags. Nobody has run them against Primolar's project
yet. If a command fails because a flag changed, fix this file in the same moment, and note it in the GCP migration
plan's implementation log.

## 0. Before you start

1. Install the tools on your Mac:
   ```
   brew install --cask google-cloud-sdk
   brew install terraform cloud-sql-proxy mysql-client
   ```
   - Terraform must be 1.9 or newer: `terraform version`.
   - Docker Desktop must be running (section 5 builds one image by hand).
   - Node 22 and pnpm 9, with `pnpm install` done.
2. Sign in to Google twice. The first is for `gcloud`, the second is for Terraform:
   ```
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project <project id>
   gcloud auth application-default set-quota-project <project id>
   ```
   Check: `gcloud config list` shows your account and the project.
3. Have these ready:
   - the project id,
   - the billing account id (Console → Billing → Account management, like `0X0X0X-0X0X0X-0X0X0X`),
   - admin rights on the GitHub repository,
   - access to the Vercel project.
4. **Billing: upgrade to a paid account before go-live.** The free trial stops every resource when it ends
   (2027-02-25) or when the US$300 credit is used up. Console → Billing → **Upgrade** (or "Activate full account").
   Unused trial credit stays usable after the upgrade. You can do the setup on the trial, but no real clinic goes live
   before the upgrade.
5. Turn on two-step sign-in on your Google account. Only you have the Owner role on the project.

## 1. Turn on the first APIs

**Where:** anywhere.

Terraform needs these two before it can turn on the rest:

```
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project <project id>
```

Worked when: the command ends with "Operation ... finished successfully".

## 2. Make the state bucket (once, by hand)

**Where:** anywhere.

Terraform keeps its state here. **The state holds the generated passwords and the files key**, so the bucket is
private and only you may read it. Never give anyone else a Storage role on this project.

```
gcloud storage buckets create gs://<project id>-tfstate --location=asia-southeast1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://<project id>-tfstate --versioning
```

Worked when: `gcloud storage buckets describe gs://<project id>-tfstate` shows `versioning_enabled: true` and
`public_access_prevention: enforced`.

## 3. Fill in the settings

**Where:** terraform folder.

```
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and fill it in. It is git-ignored, and it holds no secrets.

| Setting | Value | Notes |
| --- | --- | --- |
| `project_id` | your project id | |
| `billing_account_id` | like `0X0X0X-0X0X0X-0X0X0X` | Billing → Account management |
| `web_origins` | `["https://app.primolar.ph", "https://ops.primolar.ph"]` | Every https origin the web is served from, exact (no path, no trailing slash). The console has its own (section 9) |
| `web_url` | `https://app.primolar.ph` | Where texted invite and reset links open. Its origin must be in `web_origins` |
| `alert_email` | `alerts@primolar.ph` | Alerts, the budget, and an email when someone signs in to the console |
| `github_repo` | `HeisenbergI8/pedia-dental` | Only this repository's `production` environment, on `master`, may deploy |
| `app_env`, `demo_logins` | `"production"`, `false` | See the go-live checklist before changing |
| `trust_proxy_hops` | `2` | Leave it until section 12 |
| `api_database_user` | `"master"` | **Keep `"master"` for now.** Section 8 changes it to `"app"` |
| `semaphore_enabled`, `sms_sender_name` | `false`, `""` | Leave them until section 14 |
| `monthly_budget_amount`, `budget_currency` | `80`, `"USD"` | The billing account bills in USD. A budget in another currency is refused |

Optional settings with defaults (in `variables.tf`): `api_cpu` (`"1"`), `api_memory` (`"1Gi"`), `database_tier`
(`"db-f1-micro"`), `demo_daily_reset` (`false`, only for the client demo).

## 4. Create the image repository only

**Where:** terraform folder.

The API service needs an image before it can exist, and the image needs its repository first. So the first apply
creates only the repository (and turns on the Google APIs).

1. Connect Terraform to the state bucket:
   ```
   terraform init -backend-config="bucket=<project id>-tfstate"
   ```
   It writes `.terraform.lock.hcl`. Commit that file with your next change (it pins the provider versions).
2. Create the repository:
   ```
   terraform apply -target=google_artifact_registry_repository.api
   ```
   Terraform warns that `-target` is for exceptional cases. This is the one time it is needed. Read the plan, then
   answer `yes`.

Worked when: `gcloud artifacts repositories list --location asia-southeast1` lists `primolar`.

## 5. Push the first image by hand

**Where:** repository root.

Use a `master` commit whose `check` run on GitHub is green. `git pull` first.

```
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
TAG=$(git rev-parse HEAD)
docker build --platform linux/amd64 -f apps/api/Dockerfile -t asia-southeast1-docker.pkg.dev/<project id>/primolar/primolar-api:$TAG .
docker push asia-southeast1-docker.pkg.dev/<project id>/primolar/primolar-api:$TAG
echo $TAG
```

Keep the printed tag for section 6. Tags can never be overwritten. When the deploy workflow later deploys this same
commit, it finds this image and reuses it.

Worked when: `gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/<project id>/primolar` lists the
image with your tag.

## 6. Create everything else (about 10 to 15 minutes, mostly Cloud SQL)

**Where:** terraform folder.

```
terraform plan -var initial_image_tag=<the tag from section 5>
```

Read the plan. It creates the database, the files bucket, the secrets, the API service `primolar-api`, the release
job `primolar-release`, the alerts, the budget and the GitHub deploy identity. Nothing is destroyed. Then:

```
terraform apply -var initial_image_tag=<the tag from section 5>
```

- The service starts on the master database user, before the first migration. Its nightly jobs fail until section 8.
  One `primolar-api-unhandled-errors` email is possible: ignore that one.
- If Google refuses `db-f1-micro` with MySQL 8.4, set `database_tier = "db-g1-small"` and apply again. Never MySQL 8.0.
- If an alert policy is refused because its log-based metric "does not exist" yet, wait a minute and apply again.
- If Google sends a confirmation email to `alerts@primolar.ph`, confirm it. Without the email channel, no alert or
  budget mail arrives.

Worked when: `terraform output` prints `api_url`, `files_bucket`, `sql_connection_name`,
`github_workload_identity_provider` and `github_deploy_service_account`.

## 7. GitHub environment `production`

**Where:** terraform folder (for the values), then GitHub.

Repository → Settings → Environments → `production` (create it if it is missing):

1. Deployment branches: `master` only.
2. Optional: yourself as a required reviewer, so each deploy waits for your click.
3. **Variables** (not secrets). Get the values:
   ```
   terraform output -raw github_workload_identity_provider; echo
   terraform output -raw github_deploy_service_account; echo
   ```
   | Variable | Value |
   | --- | --- |
   | `GCP_PROJECT_ID` | your project id |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | the first output |
   | `GCP_DEPLOY_SERVICE_ACCOUNT` | the second output |
4. Delete the old `AWS_DEPLOY_ROLE_ARN` variable if it is there.

No Google key is stored anywhere. GitHub signs in with its own short-lived token, and Google accepts it only from this
repository's `production` environment on `master`.

## 8. First deploy, then switch to the app user

**Where:** GitHub, then terraform folder.

1. Actions → **deploy** → Run workflow → branch `master`, `image_tag` empty.
2. The workflow reuses the image from section 5, runs the release job `primolar-release` (it creates the API's own
   MySQL user `primolar_app` and runs the migrations), then moves `primolar-api` to the image.
3. Worked when: the run is green.
4. Now switch the API to its own user (SELECT, INSERT, UPDATE, DELETE only). In `terraform.tfvars` set
   `api_database_user = "app"`, then:
   ```
   terraform plan
   terraform apply
   ```
   The plan changes only the service's `DB_USER` and `DB_PASSWORD`, and lets the API's account read
   `primolar-database-app` instead of `primolar-database`. The `-var initial_image_tag` is no longer
   needed: Terraform ignores the image from now on (the deploy workflow owns it).
5. Worked when: `curl -s "$(terraform output -raw api_url)/api/health/ready"` answers `{"status":"ok",...}`, and Logs
   Explorer (filter below, last 15 minutes) shows no `Access denied`:
   ```
   resource.type="cloud_run_revision" resource.labels.service_name="primolar-api" "Access denied"
   ```

Why two steps: until the release job has run once, the app user does not exist, and a service that signs in as it
never becomes ready. The release job always signs in as the master user (migrations change the schema).

## 9. Point Vercel at the API

**Where:** terraform folder (for the values), then Vercel.

Vercel project → Settings → Environment Variables → **Production**:

- `API_PROXY_TARGET` = the output of `terraform output -raw api_url` (the `run.app` address, **no trailing slash**).
  The web's `/api/*` proxy (`apps/web/src/middleware.ts`) sends the browser's calls there, same-origin, so cookies
  work without CORS. `api.primolar.ph` stays unused (no DNS record).
- `ORIGIN_SECRET` = the output of `gcloud secrets versions access latest --secret primolar-origin-secret`. Mark it
  **Sensitive**. The proxy adds it as `X-Primolar-Origin`. Without it the API answers 403. Never a `NEXT_PUBLIC_`
  name: it must stay on the server.
- `NEXT_PUBLIC_API_MOCKING` = `disabled`, for Production and Preview (no deployment runs MSW).
- `OPS_HOST` = `ops.primolar.ph`, Production only. The console then opens only there: `app.primolar.ph/operator`
  answers 404, and every other page on `ops.primolar.ph` goes to the console (`apps/web/src/middleware.ts`).

Vercel project → Settings → Domains → **Add** `ops.primolar.ph` (free: a sub-address of our domain; the domain's DNS
is on Vercel, so Vercel adds the record itself).

Then redeploy the web, and sign in on it once. Worked when: the sign-in works (a 403 means `ORIGIN_SECRET` is
missing or wrong).

## 10. Prove the files bucket (before any clinic data)

**Where:** the deployed web.

The API reaches Cloud Storage through its S3-compatible API with an HMAC key. This proves it works.

1. Sign in to the staff app on the deployed web.
2. Upload a photo to a test patient.
3. Open it.
4. Download it.
5. Delete the test photo.

All four must work. If any of them answers 403 or `SignatureDoesNotMatch`, **stop**: no clinic data goes in. The
fallback is a native Cloud Storage driver (GCP migration plan, Follow Ups Q7), which is a code change.

## 11. Prove the origin lock

**Where:** terraform folder.

```
curl -s -o /dev/null -w '%{http_code}\n' "$(terraform output -raw api_url)/api/auth/me"        # 403
curl -s -o /dev/null -w '%{http_code}\n' https://app.primolar.ph/api/auth/me                    # 401
curl -s -o /dev/null -w '%{http_code}\n' "$(terraform output -raw api_url)/api/health/ready"   # 200
```

- 403: a caller that skips Vercel has no origin secret, and the API refuses it before any route runs.
- 401: the same path through the web reaches the API and answers "signed out".
- 200: the health check is open on purpose (the uptime check uses it).

## 12. Measure `TRUST_PROXY_HOPS` (go-live waits for this)

**Where:** your browser, Logs Explorer, then terraform folder.

The sign-in limits count per client address. Express finds that address by counting hops from the right of
`X-Forwarded-For`. A wrong count puts every clinic user in one sign-in limit bucket.

1. Find your public address: `curl -s https://api.ipify.org; echo`.
2. Open the web's sign-in page and sign in once.
3. Console → Logging → **Logs Explorer**, last 15 minutes, this filter:
   ```
   resource.type="cloud_run_revision" resource.labels.service_name="primolar-api" jsonPayload.req.headers."x-forwarded-for":"<your address>"
   ```
4. Open one line and read `jsonPayload.req.headers.x-forwarded-for`. Count from the **right** to your address. The
   rightmost entry is 1.
   - `"<you>, <vercel>"` means 2.
   - `"<you>"` alone means 1.
5. Put that number in `trust_proxy_hops` in `terraform.tfvars`, then `terraform plan` (only `TRUST_PROXY_HOPS`
   changes) and `terraform apply`.
6. Optional proof: 21 wrong sign-ins from your connection get `429`, while a phone on mobile data still gets `401`.
7. The count cannot be faked from outside. A caller that skips Vercel to write its own `X-Forwarded-For` has no
   origin secret, so the API refuses it (section 11). On Google Cloud that is the only lock (there is no load
   balancer). Measure again whenever the web's proxy changes.

## 13. Prove the alerts

**Where:** Logs Explorer, then the console.

1. Logs Explorer, last 15 minutes:
   ```
   resource.type="cloud_run_revision" resource.labels.service_name="primolar-api" jsonPayload.Requests:*
   ```
   One line arrives every 60 seconds (the metrics line). If no line matches, the metric fields are nested deeper
   than `monitoring.tf` expects: the filters in `local.log_metrics` must change before the alerts can work. Stop and
   fix that first.
2. Sign in to the console at `https://ops.primolar.ph`. Worked when: a `primolar-console-sign-in` email reaches
   `alerts@primolar.ph` within a few minutes. Sign-ins a minute or two apart share one email. If one ever comes that
   was not us, change the password and run the two-step enrolment again (section 17) with `--replace`.
3. Console → Monitoring → **Alerting** lists six policies: `primolar-api-unhandled-errors`,
   `primolar-api-outbox-stuck`, `primolar-api-outbox-silent`, `primolar-api-not-ready`, `primolar-console-sign-in` and
   `primolar-texts-held-daily-cap`. Console → Monitoring → **Uptime checks** shows `primolar-api-ready` green.

## 14. Semaphore (can wait until Semaphore approves the account)

**Where:** terraform folder.

- Until then, leave `semaphore_enabled = false` and `sms_sender_name = ""`. Texts go to the log driver, which is safe.
- Wait until Semaphore has approved both the account and the sender name **PRIMOLAR** (up to 5 business days). A key
  without an approved sender name makes every send fail, and the driver marks those texts refused.
- Then, together, in this order:
  1. Get a fresh API key from Semaphore first (regenerate it, or ask their support). The first key was seen in a
     setup session's screenshots on 2026-11-27, so it must not be the one stored.
  2. Store it in Secret Manager. `read -rs` keeps the key out of your shell history; paste the key, then press Enter:
     ```
     read -rs KEY
     printf '%s' "$KEY" | gcloud secrets versions add primolar-semaphore --data-file=-
     unset KEY
     ```
     Worked when: `gcloud secrets versions list primolar-semaphore` shows version 1 `enabled`.
  3. In `terraform.tfvars` set `semaphore_enabled = true` and `sms_sender_name = "PRIMOLAR"`.
  4. `terraform plan` (the service gets `SEMAPHORE_API_KEY` and `SMS_SENDER_NAME`), then `terraform apply`. The
     service starts a new revision with them. No deploy is needed.
- **Never set `semaphore_enabled = true` before step 2.** With no key version, the new revision cannot start.
- Then run the Semaphore lines of the go-live checklist (real delivery to your phone, no "test" texts, full links,
  credits).

## 15. Changing the origin secret

**Where:** terraform folder, then Vercel.

Do this if the secret may have leaked. It sits in Vercel, in Secret Manager and in Terraform's state. Expect a few
minutes of 403s between steps 1 and 2.

1. Make a new one:
   ```
   terraform apply -replace=random_password.origin
   ```
2. Vercel → `ORIGIN_SECRET` = the output of `gcloud secrets versions access latest --secret primolar-origin-secret`,
   then redeploy the web straight away.
3. Cloud Run reads the secret's `latest` version only when an instance starts. Start a new one:
   ```
   gcloud run services update primolar-api --region asia-southeast1 --update-labels=rotated=$(date +%s)
   ```
4. Check as in section 11, and sign in on the web once.

## 16. Rotating the files key

**Where:** terraform folder.

1. ```
   terraform apply -replace=google_storage_hmac_key.files
   ```
   The old key stops working at once.
2. Start a new instance, as in section 15 step 3.
3. File links made before the restart fail after at most 5 minutes (their life). Check as in section 10 (open a
   photo).

## 17. Next

1. **Enrol the operator in two-step sign-in** (production refuses the console without it). Run the enrolment from
   your own machine, through the Cloud SQL connector. This keeps the secret out of Cloud Logging, where one log line
   cannot be deleted.
   1. Terminal 1, terraform folder (leave it running):
      ```
      cloud-sql-proxy "$(terraform output -raw sql_connection_name)" --port 3310
      ```
   2. Terminal 2, repository root:
      ```
      DB_PASSWORD=$(gcloud secrets versions access latest --secret primolar-database)
      DATABASE_URL="mysql://primolar:$DB_PASSWORD@127.0.0.1:3310/primolar" pnpm --filter api db:operator-totp <operator email>
      unset DB_PASSWORD
      ```
   3. Add the printed `otpauth://` address to an authenticator app. Then clear the terminal (Cmd+K) and stop the
      proxy (Ctrl+C in terminal 1).
   4. A lost phone: the same command with `--replace` after the email. The old app stops working at once.
2. Run the [restore drill](restore-drill.md) once.
3. Work through the [go-live checklist](go-live-checklist.md).
