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
