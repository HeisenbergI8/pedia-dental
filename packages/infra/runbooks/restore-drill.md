# Restore drill (monthly, and before go-live)

B13's "done when": restoring last night's data to a fresh database works. This drill restores into a **new** Cloud
SQL instance, checks it, and deletes it. Production is never touched. About one hour; under US$1 (a second small
instance for an hour or two).

What Cloud SQL keeps for `primolar-db`:

- **Point in time:** any moment in the last **7 days** (the most Cloud SQL Enterprise keeps).
- **Daily backups:** the last **30**, taken at 02:00 Manila.

You run it, signed in with `gcloud` as yourself. Tools: `cloud-sql-proxy` and `mysql` (first-time setup, section 0).
Not run yet against Primolar's project: if a flag has changed, fix this file.

## 1. Restore to a new instance

Pick a name with today's date:

```
DRILL=primolar-drill-$(date +%Y%m%d)
```

**Point in time (within 7 days).** "Last night" is 23:00 Manila yesterday, which is 15:00 UTC. On a Mac:

```
WHEN=$(date -u -v-1d +%Y-%m-%dT15:00:00.000Z); echo $WHEN
gcloud sql instances clone primolar-db $DRILL --point-in-time "$WHEN"
```

It takes 15 to 30 minutes. Worked when: `gcloud sql instances describe $DRILL --format='value(state)'` prints
`RUNNABLE`.

**Or from a daily backup (within 30 days).** A backup restores into an instance that already exists, so create one
first:

```
gcloud sql backups list --instance primolar-db
gcloud sql instances create $DRILL --database-version MYSQL_8_4 --tier db-f1-micro --region asia-southeast1 --edition ENTERPRISE
gcloud sql backups restore <backup id> --restore-instance $DRILL --backup-instance primolar-db
```

(Use `db-g1-small` if production uses it.)

## 2. Check it from your machine

Through the Cloud SQL connector, never an open address. The copy keeps the master user `primolar` with the password
it had at that time, which is the same secret.

1. Terminal 1 (leave both running):
   ```
   cloud-sql-proxy <project id>:asia-southeast1:primolar-db --port 3310 &
   cloud-sql-proxy <project id>:asia-southeast1:$DRILL --port 3311
   ```
   (`terraform output -raw sql_connection_name` prints the first name.)
2. Terminal 2. The same query on production (3310) and on the copy (3311):
   ```
   export MYSQL_PWD=$(gcloud secrets versions access latest --secret primolar-database)
   Q="SELECT (SELECT COUNT(*) FROM ClinicAccount) AS clinics, (SELECT COUNT(*) FROM Patient) AS patients, (SELECT MAX(at) FROM AuditEvent) AS lastAudit, (SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations"
   mysql -h 127.0.0.1 -P 3310 -u primolar primolar -e "$Q"   # production
   mysql -h 127.0.0.1 -P 3311 -u primolar primolar -e "$Q"   # the copy
   unset MYSQL_PWD
   ```

**Pass:**

- Both queries print a row.
- The copy's `migrations` equals production's (unless a deploy ran after the restore time).
- Its `clinics` and `patients` are at most production's.
- Its `lastAudit` is just before the restore time.

An error or a missing row means **fail**: keep the instance and investigate.

## 3. Clean up and record

1. Stop both proxies (Ctrl+C, and `kill %1` for the one in the background).
2. Delete the copy:
   ```
   gcloud sql instances delete $DRILL
   ```
   If Google refuses because of deletion protection (a clone can copy it), turn it off on the copy only, then delete:
   ```
   gcloud sql instances patch $DRILL --no-deletion-protection
   gcloud sql instances delete $DRILL
   ```
   Check the name twice. **Never** run these on `primolar-db`.
3. Add a row below.

| Date | Restored to (UTC) | Copy: clinics / patients / last audit / migrations | Production | Took | By |
| --- | --- | --- | --- | --- | --- |

## A real restore (data damaged or lost)

1. **Restore a copy.** Pick a time just before the damage. Restore as in section 1, but name it
   `primolar-restore-<yyyymmdd>`, and **keep its deletion protection on**. Check it as in section 2. The damaged
   `primolar-db` stays untouched, for investigation.
2. **Point the service and the release job at the copy (fast).** Its connection name is
   `<project id>:asia-southeast1:primolar-restore-<yyyymmdd>`:
   ```
   NEW=<project id>:asia-southeast1:primolar-restore-<yyyymmdd>
   gcloud run services update primolar-api --region asia-southeast1 --set-cloudsql-instances $NEW --update-env-vars DB_SOCKET=/cloudsql/$NEW
   gcloud run jobs update primolar-release --region asia-southeast1 --set-cloudsql-instances $NEW --update-env-vars DB_SOCKET=/cloudsql/$NEW
   ```
   - The service signs in as `primolar_app`, which the copy holds with the password it had at the restore time. If
     `primolar-database-app` changed since, the service gets `Access denied`. Run the release job once: it sets the
     app user's password from the secret again (and runs any missing migrations):
     `gcloud run jobs execute primolar-release --region asia-southeast1 --wait`.
   - **Do not run `terraform apply` until step 4.** Terraform still points at `primolar-db` and would move the
     service back to the damaged database.
3. **Files.** The bucket keeps deleted or overwritten files as old versions for 35 days. Bring back what the
   restored rows point to, by hand:
   ```
   gcloud storage ls --all-versions gs://<project id>-primolar-files/<key>
   gcloud storage cp gs://<project id>-primolar-files/<key>#<generation> gs://<project id>-primolar-files/<key>
   ```
4. **Bring Terraform in line** (later, calmly, as its own reviewed change), from `packages/infra/terraform`:
   1. Take the old instance out of Terraform's state (this deletes nothing in Google):
      ```
      terraform state rm google_sql_database_instance.main google_sql_database.primolar google_sql_user.master
      ```
   2. In `apis.tf`, change `local.names.sql_instance` to `primolar-restore-<yyyymmdd>`. Change `sqlInstance` in
      `packages/infra/test/support/terraform.ts` to the same name, in the same commit (a test compares them).
   3. Import the copy:
      ```
      terraform import google_sql_database_instance.main projects/<project id>/instances/primolar-restore-<yyyymmdd>
      terraform import google_sql_database.primolar projects/<project id>/instances/primolar-restore-<yyyymmdd>/databases/primolar
      terraform import google_sql_user.master <project id>/primolar-restore-<yyyymmdd>/%/primolar
      ```
   4. `terraform plan`. It must **not** replace or destroy the copy. Changes to its settings (backups, flags) are
      fine. If it wants to replace it, stop and ask.
   5. `terraform apply`. The copy now has the 30 daily backups and point-in-time recovery again.
5. Write down what happened, the restore time and the counts, in the table above.
6. The damaged `primolar-db` keeps costing money. Delete it only when nobody needs it for the investigation:
   `gcloud sql instances patch primolar-db --no-deletion-protection`, then `gcloud sql instances delete primolar-db`.
