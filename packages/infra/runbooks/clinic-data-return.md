# A clinic's data returned or deleted (at cancellation)

B13c2b-2: when a clinic leaves, its data is returned to it (encrypted), deleted, or both, **only at its written
request**. The operator runs two scripts, `db:clinic-export` and `db:clinic-purge` (`apps/api/prisma/clinic-data.ts`),
which ship in the API image as `dist/clinic-data.mjs` and run as a one-off release task. Every AWS step here is the
owner's or the operator's, never an agent's. Both scripts are written to the operator trail.

**Nothing in sections 3–7 has been run against AWS yet.** Try the whole flow on the demo deployment first, with a demo
clinic, before the first real one.

The `<placeholders>` are the only things the operator fills in.

## 1. When this applies

- A clinic asks **in writing** (an email from its `contactEmail`, or a signed letter) for its data to be returned,
  deleted, or both, at cancellation. Keep the request with the ticket.
- "Deleted without return" skips sections 3–6.
- *Confirm with counsel:* the wording of the acknowledgement, and how long to wait for the clinic's confirmation
  (default: 30 days, then delete anyway and say so in writing).

## 2. Before

1. In the console, cancel the subscription and wait until the paid month is over.
2. Pause the account.
3. Note the clinic id and the **exact** name on the account (the purge compares it, trimmed, case-sensitive).
4. Have your operator user id ready (`--operator`).

## 3. Export, in production

A one-off run of the release task, as `rollback.md` runs `prisma migrate status`. The archive is encrypted inside the
task to the operator's **X.509 certificate**; the private key never leaves the operator's machine. Make the pair once
and keep the key in the operator's password manager:

```
openssl req -x509 -newkey rsa:4096 -nodes -days 730 -subj "/CN=Primolar export" -keyout export.key -out export.pem
```

The task's command (in `--overrides`, as in `rollback.md`):

```
export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?allowPublicKeyRetrieval=true" &&
echo "$CERT_B64" | base64 -d > /tmp/export.pem &&
node dist/clinic-data.mjs export <clinicId> /tmp/out --operator <operatorId> &&
tar -C /tmp/out -cf /tmp/out.tar . &&
openssl cms -encrypt -binary -aes256 -outform DER -in /tmp/out.tar -out /tmp/out.tar.cms /tmp/export.pem &&
node -e "const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');new S3Client({region:process.env.S3_REGION}).send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:'platform/exports/<clinicId>/<yyyymmdd>.tar.cms',Body:require('fs').readFileSync('/tmp/out.tar.cms')})).then(()=>console.log('uploaded'))"
```

- The release task's container has only the database settings. Pass **`S3_BUCKET` and `S3_REGION`** (the api
  service's values) as environment overrides too, or the script refuses: without them it would read the files from
  local disk and find none. The `?allowPublicKeyRetrieval=true` is the api's own (`API_DATABASE_QUERY`): without it
  the driver can't sign in after an RDS restart.
- `CERT_B64` is `base64 -w0 export.pem`, passed as a container environment override. It is a public certificate, so
  the override (visible in `describe-tasks` and CloudTrail) leaks nothing.
- The task role may put under `platform/*` (`service-stack.ts`).
- Read the task's log for the script's JSON (rows, files, missing) and "uploaded".
- Check `openssl` in the image once before the first real export: `docker run --rm primolar-api openssl version`.
- Fargate's ephemeral storage is 20 GiB by default; the export, its tar and the `.cms` take about three times the
  clinic's size. Check the clinic's storage use in the console first.

## 4. Fetch and check, on the operator's full-disk-encrypted machine

```
aws s3 cp s3://<bucket>/platform/exports/<clinicId>/<yyyymmdd>.tar.cms . && aws s3 rm s3://<bucket>/platform/exports/<clinicId>/<yyyymmdd>.tar.cms
openssl cms -decrypt -binary -inform DER -in <yyyymmdd>.tar.cms -inkey export.key -out export.tar
mkdir export && tar -C export -xf export.tar && (cd export && sha256sum -c SHA256SUMS)
```

- Every line must say `OK`.
- Read `manifest.json`: if `missing` isn't empty, list those keys in the letter to the clinic.
- The `aws s3 rm` leaves a noncurrent version for up to 35 days, encrypted to the operator's certificate.

## 5. Hand over, encrypted

```
7z a -t7z -mhe=on -p <clinic-name>-<yyyymmdd>.7z ./export      # AES-256, file names hidden too
```

- The passphrase comes from `openssl rand -base64 24`, typed at 7z's prompt and never written into a file or an email.
- Upload the archive to `s3://<bucket>/platform/exports/<clinicId>/handover.7z`. Send the clinic's `contactEmail` a
  link from `aws s3 presign s3://<bucket>/platform/exports/<clinicId>/handover.7z --expires-in 604800` (7 days,
  SigV4's maximum).
- **Give the passphrase separately**, by phone, to the clinic's Owner (the person named on the account), after
  checking who they are. Never by the same email.
- The letter says what is in it (`manifest.json`), how to open it (7-Zip or Keka), that `SHA256SUMS` checks it, and
  what isn't in it (Primolar's invoices and agreements, which the clinic already has).

## 6. Wait for the clinic's written confirmation

The clinic confirms in writing that it opened and kept the copy. Then delete `handover.7z` from S3 and every local
copy (`export.tar`, `export/`, the `.cms` and the `.7z`).

## 7. Purge

A one-off release task again, with this command:

```
export DATABASE_URL="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?allowPublicKeyRetrieval=true" &&
node dist/clinic-data.mjs purge <clinicId> --confirm "<exact clinic name>" --operator <operatorId>
```

- It refuses, and deletes nothing, unless the subscription has ended, the account is paused and the name matches.
- Re-running it after a crash is safe; after it has finished it does nothing.
- The files go through the outbox within minutes. Check the background instance's log for `storage.delete` failures.
- Primolar keeps the account row (now with `purgedAt`; the console's Reactivate is refused), its own invoices and
  receipts, the agreements and the sign-up.

## 8. Tell the clinic in writing

What was deleted and when. Copies remain for a while: S3's noncurrent versions for up to **35 days**, and RDS automated
backups and point-in-time restore for up to **30 days**. They then expire on their own, and nothing restores them into
the service. *Confirm with counsel* that this wording meets "returned or deleted".

## 9. The record kept

- The ticket holds the written request, and the dates of the handover, the confirmation and the purge.
- The operator trail holds "Clinic data (export)" and "Clinic data (purged)".
- The account row (`purgedAt`) and Primolar's books stay.
