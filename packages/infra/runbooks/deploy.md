# Deploy

**When:** a change is merged to `master` and the `check` workflow (`api.yml`) passed on that commit.

## How

1. Merge to `master`. Wait for the green `check` run.
2. GitHub → Actions → **deploy** → Run workflow → branch `master`, `image_tag` **empty**.
3. If you set a reviewer on the `production` environment, approve the run.
4. One deploy runs at a time. A second one waits for the first.

## What the workflow does

| Step | Takes | If it fails |
| --- | --- | --- |
| Refuse a commit without a green check | seconds | CI has not passed (or is still running). Wait or fix, then run again |
| Sign in to Google (Workload Identity Federation, as `primolar-deploy`) | seconds | The `production` variables are missing or wrong (first-time setup, section 7) |
| Build and push the image `primolar-api:<commit sha>` to Artifact Registry | 3 to 8 min | A Docker build error: the same as CI's `image` job |
| Check that `primolar-api` and `primolar-release` exist | seconds | Only on a first deploy: apply Terraform first (first-time setup, section 6) |
| Run the release job `primolar-release` (`prisma migrate deploy`) | 1 to 3 min | Migrations failed. **Nothing moved: the service still runs the old image.** See [rollback](rollback.md), section 3 |
| Update the service `primolar-api` to the new image | 2 to 5 min | The new revision never passed `/api/health/ready`. Traffic stays on the old revision. See [rollback](rollback.md), section 1 |

The log of the step "The service and the release job exist" prints the image that runs now. Keep it: it is your
rollback target.

## After

**Where:** `packages/infra/terraform`.

1. `curl -fsS "$(terraform output -raw api_url)/api/health/ready"` answers `{"status":"ok",...}`.
2. Console → Monitoring → **Alerting**: no open incident.
3. Sign in on the web once.

## Read the release job's log

Console → Cloud Run → **Jobs** → `primolar-release` → the newest execution → **Logs**. Or from your terminal:

```
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="primolar-release"' --freshness=1h --order=asc --format='value(timestamp,textPayload,jsonPayload)'
```

## Errors by fingerprint

Every unexpected error logs a `fingerprint` (its name and first three frames, never the message). The
`primolar-api-unhandled-errors` email points here.

1. Console → Logging → **Logs Explorer**, this filter:
   ```
   resource.type="cloud_run_revision" resource.labels.service_name="primolar-api" jsonPayload.fingerprint:*
   ```
2. In the **Log fields** panel on the left, open `jsonPayload` → `fingerprint`: it shows each fingerprint and how
   many lines have it.

Or from your terminal, the last day, most frequent first:

```
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="primolar-api" AND jsonPayload.fingerprint:*' --freshness=1d --format='value(jsonPayload.fingerprint)' | sort | uniq -c | sort -rn
```

## Rules that keep a deploy safe

- Migrations are expand-then-contract (API CONVENTIONS): the previous image must work against the new schema. That
  is what makes a [rollback](rollback.md) safe.
- During a deploy, the old and the new revision overlap for a minute or two. Two background workers at once is safe
  (job leases, `SKIP LOCKED`).

## Infrastructure changes

The workflow never runs Terraform. It changes only the image of the release job and of the service. Every other
change is yours, by hand, from `packages/infra/terraform`:

1. Edit the `.tf` file or `terraform.tfvars`.
2. `terraform plan`. Read it. Any line that says the database or the files bucket will be **destroyed** or
   **replaced** means stop and ask. (Both are protected: Terraform refuses to destroy them.)
3. `terraform apply`.
4. Commit the `.tf` change through a pull request as usual. (`terraform.tfvars` stays on your machine.)

## Running deploy again for the same commit

After a later step failed, run deploy again with `image_tag` empty. Tags never change, so it finds the image already
pushed for the commit, skips the build, and runs the migrations again.
