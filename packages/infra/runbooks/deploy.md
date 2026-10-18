# Deploy

**When:** a change is merged to `master` and the `check` workflow passed on that commit.

**How:** Actions → **deploy** → Run workflow → branch `master`, `image_tag` empty. If you set a reviewer on the
`production` environment, approve the run. One deploy runs at a time; a second one waits.

| Step | Takes | If it fails |
| --- | --- | --- |
| Refuse a commit without a green check | seconds | CI hasn't passed (or is still running): wait or fix, then run again |
| Build and push the image (`primolar-api:<sha>`) | 3–8 min | A Docker build error: the same as CI's `image` job |
| Point the release task at the new image | 1–2 min | CloudFormation error: read the stack's events. Nothing has changed for users |
| Run the release task (`prisma migrate deploy`) | 1–3 min | Migrations failed. **The services still run the old image.** See [rollback](rollback.md) §3 |
| Update the services to the new image | 5–10 min | New tasks failed their health checks. ECS rolls back by itself (circuit breaker), and the old image keeps serving. Read the `api` service's events and the log group `/primolar/api` |

**After:**
- `curl -fsS https://<apiDomain>/api/health/ready`
- CloudWatch → Alarms: all three `primolar-api-*` alarms are OK.

**Rules that keep a deploy safe:**
- Migrations are expand-then-contract (API CONVENTIONS): the previous image must work against the new schema. That
  is what makes [rollback](rollback.md) safe.
- During a deploy, old and new tasks overlap for a minute or two. Two background workers at once is safe (job leases,
  `SKIP LOCKED`).

**Infrastructure changes:**
- Changes to `PrimolarService` (in `packages/infra/src/service-stack.ts` or `cdk.json`) go out with the next deploy
  run.
- Changes to `PrimolarFoundation` are never deployed by the workflow. Run `cdk diff PrimolarFoundation` first. Any
  line that says the database will be **replaced** means stop and ask. Then run `cdk deploy PrimolarFoundation`.

**First deploy only:** the stack is created on the new image about a minute before the first migration. One
"unhandled errors" alarm email may arrive.
