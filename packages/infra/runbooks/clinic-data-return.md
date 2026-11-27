# A clinic's data returned or deleted (at cancellation)

B13c2b-2: when a clinic leaves, its data is returned to it (encrypted), deleted, or both, **only at its written
request**. The operator runs two scripts, `db:clinic-export` and `db:clinic-purge` (`apps/api/prisma/clinic-data.ts`),
which ship in the API image as `dist/clinic-data.mjs` and run as a one-off execution of the release job
`primolar-release`. Every Google Cloud step here is the owner's or the operator's, never an agent's. Both scripts are
written to the operator trail.

**Nothing in sections 3 to 7 has been run against Google Cloud yet.** Try the whole flow on the demo deployment first,
with a demo clinic, before the first real one. If a `gcloud` flag has changed, fix this file.

The `<placeholders>` are the only things the operator fills in. `<bucket>` is the files bucket:
`terraform -chdir=packages/infra/terraform output -raw files_bucket` (it is `<project id>-primolar-files`).

## 1. When this applies

- A clinic asks **in writing** (an email from its `contactEmail`, or a signed letter) for its data to be returned,
  deleted, or both, at cancellation. Keep the request with the ticket.
- "Deleted without return" skips sections 3 to 6.
- *Confirm with counsel:* the wording of the acknowledgement, and how long to wait for the clinic's confirmation
  (default: 30 days, then delete anyway and say so in writing).

## 2. Before

1. In the console, cancel the subscription and wait until the paid month is over.
2. Pause the account.
3. Note the clinic id and the **exact** name on the account (the purge compares it, trimmed, case-sensitive).
4. Have your operator user id ready (`--operator`).
5. Do not run a deploy while sections 3 and 7 are in progress (they change the release job for a while).

## 3. Export, in production

The archive is encrypted inside the job to the operator's **X.509 certificate**. The private key never leaves the
operator's machine. Make the pair once and keep the key in the operator's password manager:

```
openssl req -x509 -newkey rsa:4096 -nodes -days 730 -subj "/CN=Primolar export" -keyout export.key -out export.pem
```

**3.1. Check `openssl` in the image** (once, before the first real export):

```
gcloud run jobs execute primolar-release --region asia-southeast1 --wait --args='^##^openssl version'
```

Read the job's log ([deploy](deploy.md), "Read the release job's log"): it prints an OpenSSL version.

**3.2. Give the release job the files key, for this export only.** The release job's account `primolar-release` has
no files key and no bucket rights of its own (decided: grant it only for each export, then remove it).

```
PROJECT=<project id>
RELEASE=primolar-release@$PROJECT.iam.gserviceaccount.com
for S in primolar-files-hmac-id primolar-files-hmac-secret; do
  gcloud secrets add-iam-policy-binding $S --member="serviceAccount:$RELEASE" --role=roles/secretmanager.secretAccessor
done
```

**3.3. Add the storage settings to the job, for this export only.** The job has only the database settings. Without
`S3_BUCKET` the script would read the files from its own empty disk, and every file would land in `missing`.

```
CERT_B64=$(base64 < export.pem | tr -d '\n')
gcloud run jobs update primolar-release --region asia-southeast1 \
  --update-env-vars "CERT_B64=$CERT_B64,S3_BUCKET=<bucket>,S3_REGION=auto,S3_ENDPOINT=https://storage.googleapis.com,S3_FORCE_PATH_STYLE=true" \
  --update-secrets "S3_ACCESS_KEY_ID=primolar-files-hmac-id:latest,S3_SECRET_ACCESS_KEY=primolar-files-hmac-secret:latest"
```

- `CERT_B64` is a public certificate, so having it in the job's settings leaks nothing.
- **A large clinic.** A Cloud Run job's disk is in its memory: 512 MiB. The export, its tar and the `.cms` take about
  three times the clinic's size. Check the clinic's storage use in the console first. Over about 150 MB, add
  `--memory 4Gi` to the command above.

**3.4. Run the export.** Write the job's command into a file first (the quoted `'EOF'` keeps your shell from
changing it). Fill in the three placeholders inside it:

```
cat > export-command.sh <<'EOF'
export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?socket=$DB_SOCKET" &&
echo "$CERT_B64" | base64 -d > /tmp/export.pem &&
node dist/clinic-data.mjs export <clinicId> /tmp/out --operator <operatorId> &&
tar -C /tmp/out -cf /tmp/out.tar . &&
openssl cms -encrypt -binary -aes256 -outform DER -in /tmp/out.tar -out /tmp/out.tar.cms /tmp/export.pem &&
node -e "const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');new S3Client({region:process.env.S3_REGION,endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}}).send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:'platform/exports/<clinicId>/<yyyymmdd>.tar.cms',Body:require('fs').readFileSync('/tmp/out.tar.cms')})).then(()=>console.log('uploaded'))"
EOF
gcloud run jobs execute primolar-release --region asia-southeast1 --wait --args="^##^$(cat export-command.sh)"
```

- `^##^` at the start tells `gcloud` not to split the command at its commas.
- The `--args` replace the job's command for this one execution only.
- The job stops after 15 minutes. For a large clinic, add `--task-timeout 3600s` to the `execute` line.
- Read the job's log for the script's JSON (`rows`, `files`, `missing`) and `uploaded`. If `missing` lists many
  files, check that step 3.3 was done.

**3.5. Put the job back, straight away:**

```
gcloud run jobs update primolar-release --region asia-southeast1 \
  --remove-env-vars CERT_B64,S3_BUCKET,S3_REGION,S3_ENDPOINT,S3_FORCE_PATH_STYLE \
  --remove-secrets S3_ACCESS_KEY_ID,S3_SECRET_ACCESS_KEY \
  --memory 512Mi
for S in primolar-files-hmac-id primolar-files-hmac-secret; do
  gcloud secrets remove-iam-policy-binding $S --member="serviceAccount:$RELEASE" --role=roles/secretmanager.secretAccessor
done
rm export-command.sh
```

Worked when: `terraform plan` (in `packages/infra/terraform`) shows "No changes". (The secret bindings from 3.2 are
not in Terraform, so only the `remove-iam-policy-binding` lines take them away. A plan does not show them.)

## 4. Fetch and check, on the operator's full-disk-encrypted machine

```
gcloud storage cp gs://<bucket>/platform/exports/<clinicId>/<yyyymmdd>.tar.cms . && gcloud storage rm gs://<bucket>/platform/exports/<clinicId>/<yyyymmdd>.tar.cms
openssl cms -decrypt -binary -inform DER -in <yyyymmdd>.tar.cms -inkey export.key -out export.tar
mkdir export && tar -C export -xf export.tar && (cd export && shasum -a 256 -c SHA256SUMS)
```

- Every line must say `OK`.
- Read `manifest.json`: if `missing` is not empty, list those keys in the letter to the clinic.
- The `gcloud storage rm` leaves an old version for up to 35 days, encrypted to the operator's certificate.

## 5. Hand over, encrypted

```
7z a -t7z -mhe=on -p <clinic-name>-<yyyymmdd>.7z ./export      # AES-256, file names hidden too
```

- The passphrase comes from `openssl rand -base64 24`, typed at 7z's prompt and never written into a file or an email.
- Upload the archive:
  `gcloud storage cp <clinic-name>-<yyyymmdd>.7z gs://<bucket>/platform/exports/<clinicId>/handover.7z`.
- Make a 7-day download link. It is signed as the files account `primolar-files`, so give yourself the right to sign
  as it for this one link, then take it away:
  ```
  FILES=primolar-files@<project id>.iam.gserviceaccount.com
  ME=$(gcloud config get-value account)
  gcloud iam service-accounts add-iam-policy-binding $FILES --member="user:$ME" --role=roles/iam.serviceAccountTokenCreator
  gcloud storage sign-url gs://<bucket>/platform/exports/<clinicId>/handover.7z --duration=7d --impersonate-service-account=$FILES
  gcloud iam service-accounts remove-iam-policy-binding $FILES --member="user:$ME" --role=roles/iam.serviceAccountTokenCreator
  ```
  (The new role can take a minute to work. If `sign-url` is refused, wait a minute and run it again.) Send the
  printed link to the clinic's `contactEmail`. Seven days is the longest a signed link can last.
- **Give the passphrase separately**, by phone, to the clinic's Owner (the person named on the account), after
  checking who they are. Never by the same email.
- The letter says what is in it (`manifest.json`), how to open it (7-Zip or Keka), that `SHA256SUMS` checks it, and
  what is not in it (Primolar's invoices and agreements, which the clinic already has).

## 6. Wait for the clinic's written confirmation

The clinic confirms in writing that it opened and kept the copy. Then delete `handover.7z` from the bucket
(`gcloud storage rm gs://<bucket>/platform/exports/<clinicId>/handover.7z`) and every local copy (`export.tar`,
`export/`, the `.cms` and the `.7z`).

## 7. Purge

A one-off execution of the release job again, with this command. It needs no storage settings: the API's own
instance deletes the files through the outbox.

```
gcloud run jobs execute primolar-release --region asia-southeast1 --wait \
  --args='^##^export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?socket=$DB_SOCKET" && node dist/clinic-data.mjs purge <clinicId> --confirm "<exact clinic name>" --operator <operatorId>'
```

- If the clinic's name has a single quote (`'`) in it, write the command into a file instead, as in step 3.4.
- The release job signs in as the master user, so the script has the rights it needs.
- It refuses, and deletes nothing, unless the subscription has ended, the account is paused and the name matches.
- Running it again after a crash is safe; after it has finished it does nothing.
- The files go through the outbox within minutes. Check the API's log for `storage.delete` failures (Logs Explorer:
  `resource.type="cloud_run_revision" resource.labels.service_name="primolar-api" "storage.delete"`).
- Primolar keeps the account row (now with `purgedAt`; the console's Reactivate is refused), its own invoices and
  receipts, the agreements and the sign-up.

## 8. Tell the clinic in writing

What was deleted and when. Copies remain for a while: the files bucket's old versions for up to **35 days**, Cloud
SQL's daily backups for up to **30 days**, and its point-in-time logs for up to **7 days**. They then expire on their
own, and nothing restores them into the service. *Confirm with counsel* that this wording meets "returned or
deleted".

## 9. The record kept

- The ticket holds the written request, and the dates of the handover, the confirmation and the purge.
- The operator trail holds "Clinic data (export)" and "Clinic data (purged)".
- The account row (`purgedAt`) and Primolar's books stay.
