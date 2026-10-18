# Restore drill (monthly, and before go-live)

B13's "done when": restoring last night's backup to a fresh database works. RDS keeps 30 days of point-in-time
restore. This drill restores into a **new** instance, checks it, and deletes it. Production is never touched.
About 1 hour; under US$1. Administrator credentials (the deploy role can't do this).

## 1. Restore

```
F() { aws cloudformation describe-stacks --stack-name PrimolarFoundation --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
SRC=$(F DatabaseInstanceId); SUBNETS=$(F DatabaseSubnetGroup); DBSG=$(F DatabaseSecurityGroupId)
PARAMS=$(aws rds describe-db-instances --db-instance-identifier "$SRC" --query "DBInstances[0].DBParameterGroups[0].DBParameterGroupName" --output text)
aws rds describe-db-instances --db-instance-identifier "$SRC" --query "DBInstances[0].LatestRestorableTime"
DRILL=primolar-drill-$(date +%Y%m%d)
# "Last night": 23:00 Manila yesterday = 15:00 UTC. Or replace --restore-time … with --use-latest-restorable-time.
aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier "$SRC" --target-db-instance-identifier "$DRILL" \
  --restore-time "$(date -u -d 'yesterday 15:00' +%Y-%m-%dT%H:%M:%SZ)" \
  --db-subnet-group-name "$SUBNETS" --vpc-security-group-ids "$DBSG" --db-parameter-group-name "$PARAMS" \
  --db-instance-class db.t4g.micro --no-multi-az --no-publicly-accessible --no-deletion-protection \
  --tags Key=purpose,Value=restore-drill
aws rds wait db-instance-available --db-instance-identifier "$DRILL"   # 15–30 min
HOST=$(aws rds describe-db-instances --db-instance-identifier "$DRILL" --query "DBInstances[0].Endpoint.Address" --output text)
```

(`date -d` is GNU date. On macOS, write the UTC time by hand.)

## 2. Check it from inside the VPC

A one-off run of the release task definition, with its command replaced and `DB_HOST` pointed at the copy. The
restored instance keeps the master password it had at that time, which is the same secret.

```
cat > drill-check.cjs <<'EOF'
// Counts that prove the copy holds real data. Uses the mariadb driver already in the image.
const { readdirSync } = require("node:fs");
const dir = readdirSync("/app/node_modules/.pnpm").find((name) => name.startsWith("mariadb@"));
const mariadb = require(`/app/node_modules/.pnpm/${dir}/node_modules/mariadb`);
(async () => {
  const db = await mariadb.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [row] = await db.query("SELECT (SELECT COUNT(*) FROM ClinicAccount) AS clinics, (SELECT COUNT(*) FROM Patient) AS patients, (SELECT MAX(at) FROM AuditEvent) AS lastAudit, (SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS migrations");
  console.log("DRILL", process.env.DB_HOST, JSON.stringify(row, (_key, value) => (typeof value === "bigint" ? Number(value) : value)));
  await db.end();
})().catch((error) => { console.error("DRILL FAILED", error.message); process.exit(1); });
EOF
overrides() { jq -n --arg host "$1" --arg b64 "$(base64 -w0 drill-check.cjs)" \
  '{containerOverrides:[{name:"release",environment:([$host]|map(select(. != ""))|map({name:"DB_HOST",value:.})),command:["sh","-c",("echo " + $b64 + " | base64 -d > /tmp/check.cjs && node /tmp/check.cjs")]}]}'; }
S() { aws cloudformation describe-stacks --stack-name PrimolarService --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
NET="awsvpcConfiguration={subnets=[$(S TaskSubnetIds)],securityGroups=[$(S TaskSecurityGroupId)],assignPublicIp=ENABLED}"
aws ecs run-task --cluster primolar --task-definition primolar-api-release --launch-type FARGATE --network-configuration "$NET" --overrides "$(overrides "$HOST")"
aws ecs run-task --cluster primolar --task-definition primolar-api-release --launch-type FARGATE --network-configuration "$NET" --overrides "$(overrides "")"   # production, to compare
sleep 120; aws logs tail /primolar/api --log-stream-name-prefix primolar-api-release --since 10m | grep DRILL
```

**Pass:**
- Both lines print.
- The copy's `migrations` equals production's.
- Its `clinics` and `patients` are at most production's.
- Its `lastAudit` is just before the restore time.

`DRILL FAILED` or a missing line means **fail**: keep the instance and investigate.

## 3. Clean up and record

```
aws rds delete-db-instance --db-instance-identifier "$DRILL" --skip-final-snapshot --delete-automated-backups
rm drill-check.cjs
```

Add a row below.

| Date | Restored to (UTC) | Copy: clinics / patients / last audit / migrations | Production | Took | By |
| --- | --- | --- | --- | --- | --- |

## A real restore (data damaged or lost)

1. Pick a time just before the damage. Restore as in §1, but name it `primolar-restore-<date>` and **keep deletion
   protection on** (leave out `--no-deletion-protection`). Check it as in §2.
2. In `packages/infra/cdk.json`, set `databaseHostOverride` to the restored instance's endpoint. Merge, then run
   **deploy** with `image_tag` = the tag running now (`ImageTagInUse`). The services and the release task now use
   the restored copy. The damaged original stays untouched for investigation.
3. Files: the bucket keeps deleted or overwritten files as old versions for 35 days. Bring back what the restored
   rows point to with `aws s3api list-object-versions` and `copy-object`. This is a manual step.
4. Later, as its own reviewed change: keep the override (the restored instance isn't managed by CDK, so set its
   backups to 30 days by hand: `aws rds modify-db-instance --backup-retention-period 30`), or plan a migration back.
