# Rollback

Commands run from anywhere, signed in with `gcloud` as yourself (first-time setup, section 0). Not run yet against
Primolar's project: if a flag has changed, fix this file.

## 1. A new revision never became ready

Nothing to do. Cloud Run sends traffic to a new revision only after it passes `/api/health/ready`. It did not, so
traffic stayed on the old revision, and the workflow is red.

1. Read the failed revision's logs: Console → Cloud Run → `primolar-api` → **Revisions** → the newest one → **Logs**.
2. Fix it in a new commit, then deploy again.

## 2. A deploy succeeded but the new version misbehaves

**The usual way: deploy an older image.**

1. Find the last good image tag. It is printed in the failing run's step "The service and the release job exist"
   ("Running now: ..."). Or list the newest images:
   ```
   gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/<project id>/primolar/primolar-api --include-tags --sort-by=~UPDATE_TIME --limit=5
   ```
2. GitHub → Actions → **deploy** → Run workflow → `image_tag` = that commit SHA. It skips the build and the
   migrations and moves the service back, in a few minutes.

**The fastest way, with no new revision:** move all traffic to the previous revision.

1. List the revisions:
   ```
   gcloud run revisions list --service primolar-api --region asia-southeast1
   ```
2. Move the traffic:
   ```
   gcloud run services update-traffic primolar-api --region asia-southeast1 --to-revisions=<previous revision>=100
   ```
3. **Important:** while traffic is pinned to one revision, a later deploy creates its new revision but sends it **no
   traffic**. Before the next deploy, run:
   ```
   gcloud run services update-traffic primolar-api --region asia-southeast1 --to-latest
   ```

**Either way:** the database keeps the new migrations. That is safe because migrations are expand-then-contract (the
older revision still works with the new schema). Then fix forward with a new commit.

## 3. The release job failed (migrations)

The service did not move: it still runs the previous image. A MySQL migration that failed half-way can leave tables
changed, because DDL is not transactional in MySQL. Prisma records it as failed, and every later `migrate deploy`
stops until it is resolved.

1. Read the job's log (see [deploy](deploy.md), "Read the release job's log").
2. See the state: run the release job once with a different command. The `--args` replace the job's command for this
   one execution only. The job itself is unchanged for the next deploy.
   ```
   gcloud run jobs execute primolar-release --region asia-southeast1 --wait \
     --args='^##^export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?socket=$DB_SOCKET" && exec node_modules/.bin/prisma migrate status'
   ```
   - The single quotes stop your own shell from filling in `$DB_USER` and the others. The job fills them in.
   - `^##^` at the start tells `gcloud` not to split the command at commas.
   Then read the log as in step 1.
3. Fix forward: undo the half-applied change by hand if needed, then mark the migration rolled back, the same way:
   ```
   gcloud run jobs execute primolar-release --region asia-southeast1 --wait \
     --args='^##^export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?socket=$DB_SOCKET" && exec node_modules/.bin/prisma migrate resolve --rolled-back <migration name>'
   ```
4. Commit a corrected migration and deploy again. **Never edit a migration that was already applied.** If the data
   itself is damaged, go to section 4.

## 4. Data is damaged or lost

Restore to a point in time before the damage: [restore drill](restore-drill.md), "A real restore".

## 5. An infrastructure change went wrong

From `packages/infra/terraform`: revert the `.tf` change (or `terraform.tfvars`), then `terraform plan` and
`terraform apply` again. The database and the files bucket cannot be destroyed by accident: the database has
deletion protection (in Terraform and in Google), and the bucket has `prevent_destroy`.
