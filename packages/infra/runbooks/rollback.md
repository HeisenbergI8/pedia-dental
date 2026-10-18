# Rollback

## 1. A deploy failed while rolling (new tasks unhealthy)

Nothing to do: ECS's circuit breaker put the old tasks back, CloudFormation rolled the stack back, and the workflow
is red. Read the new tasks' logs (`/primolar/api`), fix, and deploy again.

## 2. A deploy succeeded but the new version misbehaves

1. Find the previous image tag:
   `aws ecr describe-images --repository-name primolar-api --query "reverse(sort_by(imageDetails,&imagePushedAt))[:5].[imageTags[0],imagePushedAt]" --output table`
   (or the commit of the last good **deploy** run).
2. Actions → **deploy** → Run workflow → `image_tag` = that SHA. It skips the build and the migrations and moves the
   services back, in about 10 minutes.
3. The database keeps the new migrations. That is safe because migrations are expand-then-contract. Fix forward with
   a new commit.

## 3. The release task failed (migrations)

The services still run the previous image. A MySQL migration that failed half-way can leave tables changed, because
DDL isn't transactional in MySQL. Prisma records it as failed, and every later `migrate deploy` stops until it is
resolved.

1. Read the task's log: `aws logs tail /primolar/api --log-stream-name-prefix primolar-api-release --since 1h`.
2. See the state. Run the release task with the command `prisma migrate status` (your administrator credentials):
   ```
   OUT() { aws cloudformation describe-stacks --stack-name PrimolarService --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
   aws ecs run-task --cluster primolar --task-definition primolar-api-release --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[$(OUT TaskSubnetIds)],securityGroups=[$(OUT TaskSecurityGroupId)],assignPublicIp=ENABLED}" \
     --overrides '{"containerOverrides":[{"name":"release","command":["sh","-c","export DATABASE_URL=\"mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME\" && exec node_modules/.bin/prisma migrate status"]}]}'
   ```
3. Fix forward: undo the half-applied change by hand if needed, then
   `prisma migrate resolve --rolled-back <migration>` (the same override, with that command). Then deploy a corrected
   migration. If the data itself is damaged, go to §4.

## 4. Data is damaged or lost

Restore to a point in time before the damage: [restore drill](restore-drill.md), "A real restore".

## 5. An infrastructure change went wrong

CloudFormation rolls a failed update back by itself. For a change that succeeded but is wrong: revert the commit,
then deploy again (service stack) or run `cdk deploy PrimolarFoundation` (foundation).
