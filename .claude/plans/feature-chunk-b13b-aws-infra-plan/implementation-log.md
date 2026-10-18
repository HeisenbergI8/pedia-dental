# Implementation log: B13b AWS infrastructure as code, deploy and runbooks

## Phases 1–3: `@pedia/infra`, PrimolarFoundation, PrimolarService — 2026-10-18

**Steps completed:** 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3
**Files changed:** `packages/infra/{package.json,tsconfig.json,vitest.config.mts,cdk.json}`, `src/{config,foundation-stack,service-stack,primolar}.ts`, `bin/app.ts`, `test/{config,foundation-stack,service-stack,app}.test.ts`, `test/support/{settings,stacks}.ts`, `.gitignore` (`cdk.out`), `pnpm-lock.yaml`
**Deviations from plan:**
- **Q4 answered:** CloudFormation's own validation refuses `EngineVersion: "8.4"`; it lists 8.4.3–8.4.11. The engine is pinned to `MysqlEngineVersion.VER_8_4_10`, the newest this aws-cdk-lib knows, and `autoMinorVersionUpgrade` stays on. The test expects `"8.4.10"`.
- **Deploy role and `"*"`:** `grantPullPush` adds `ecr:GetAuthorizationToken` on `"*"`, which AWS requires because that action has no resource-level permissions. The test now pins that this one statement, and only it, uses `"*"`, then applies the plan's no-wildcard rule to the rest.
- **Cross-stack cycle:** the plan's Phase 3 issue happened. Passing the foundation's `AppSg` to the services put the ALB → task rule in PrimolarFoundation, pointing at PrimolarService's ALB group (`DependencyCycle`). The services now use `ec2.SecurityGroup.fromSecurityGroupId(this, "TaskSg", …)`, so the rule is created in PrimolarService; the plan's ingress assertion holds as written.
- **Typing:** `smsSecrets` is typed `Record<string, ecs.Secret>`, because the conditional spread didn't typecheck.
- **Deprecated API:** the Logs Insights query uses `statsStatements` (`stats` is deprecated in 2.273).
**Gate:**
- `pnpm run check`: exit 0. `@pedia/infra`: 4 files, 31 tests.
- Offline `pnpm exec cdk synth -q -c apiDomain=… -c webOrigins=… -c webUrl=… -c alertEmail=…` with no AWS credentials: exit 0, both templates written.
- With the committed empty `cdk.json` values, synth stops at "apiDomain is not set …", as designed.
**Notes:** synth warns that cross-stack references default to "strong". That is CDK's current behaviour and what this design wants: the foundation's exports protect the producer. Left as a warning.

## Phases 4–6: Deploy workflow, runbooks, docs — 2026-10-18

**Steps completed:** 4.1, 4.2, 5.1–5.5, 6.1, 6.2
**Files changed:** `.github/workflows/deploy.yml` (new), `packages/infra/test/deploy-workflow.test.ts` (new), `packages/infra/README.md`, `packages/infra/runbooks/{first-time-setup,deploy,rollback,restore-drill,go-live-checklist}.md` (new), `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/README.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** none. The workflow and runbooks are the plan's text.
**Gate:** `pnpm run check`: exit 0. `@pedia/infra`: 5 files, 38 tests, including the 7 `deploy-workflow` invariants.
**Notes:**
- `deploy.yml`, the runbooks' AWS CLI commands and the deploy role's rights are unproven until the owner's first real run (Q6). This is inherent to an offline plan.
- CHUNKS marks B13b done in the sense its own line states: code and runbooks merged; AWS is the owner's.

## Tester fixes — 2026-10-18

**1. Cold auth cache with no TLS (tester, high)**
- **Problem:** with no TLS (I5) and `caching_sha2_password`, the mariadb driver can't sign in after a server restart until something warms the cache. The tester reproduced this on MySQL 8.0, and it would follow any RDS reboot, failover or minor upgrade.
- **Fix:** the service tasks' `DATABASE_URL` now ends in `?allowPublicKeyRetrieval=true` (`API_DATABASE_QUERY`, `withDatabaseUrl(command, query)`). The release task's URL is unchanged, because the schema engine fetches the key itself.
- **Checked:** PrismaMariaDb with that URL connected to the local MySQL and ran a raw and a model query.
- **Real fix:** TLS with the RDS CA in the image, which stays the I5 follow-up.

**2. Same-commit re-run (tester, medium):** a re-run would have failed pushing an immutable tag. A new step, "Image already pushed for this commit?", skips the build when ECR has the tag; the migrations still run.

**3. Failed first deploy (tester, low–medium):** a failed first deploy leaves `ROLLBACK_COMPLETE` with no outputs. "Read the tag" now refuses anything that isn't a SHA, with a pointer to a new `runbooks/deploy.md` section (delete the empty stack, run again). That replaces passing `ImageTag=None`.

**4. Coverage gap:** `service-stack.test.ts` now runs the API's own `loadEnv` against each task's synthesized environment (`APP_ENV=production`).

**Left as is (low):**
- Actions are pinned by tag, not SHA.
- Fixed names collide on a delete-and-recreate of the foundation, which never happens by design.
- The `None` exit code when the release task can't start: the workflow still fails.

**Gate:** `pnpm run check` (exit code above). `@pedia/infra`: 40 tests.
