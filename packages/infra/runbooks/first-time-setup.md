# First-time setup (once per AWS account)

You run every step; nothing here runs from CI. Allow about two hours, most of it waiting.
Commands run from the repository root unless a step says otherwise. `cdk` below means
`pnpm --filter @pedia/infra exec cdk`.

## 0. Before you start

- A **dedicated AWS account** for Primolar. The budget counts the whole account.
- Root user with MFA, used for nothing else. An administrator for daily work (IAM Identity Center).
- AWS CLI v2 signed in as that administrator: `aws sts get-caller-identity` shows the account. Run
  `aws configure set region ap-southeast-1`.
- Node 22 and pnpm 9 (`pnpm install` done).
- Access to the DNS of the domain the API will use, and admin rights on the GitHub repository.

## 1. Fill in the settings

In `packages/infra/cdk.json` → `context`:

| Setting | Example | Notes |
| --- | --- | --- |
| `apiDomain` | `api.primolar.ph` | The API's own host name |
| `webOrigins` | `https://app.primolar.ph` | Every https origin the web is served from, comma-separated, exact (no path, no trailing slash) |
| `webUrl` | `https://app.primolar.ph` | Where texted invite and reset links open; its origin must be in `webOrigins` |
| `alertEmail` | `ops@…` | Alarms and the budget |
| `githubRepo` | `HeisenbergI8/pedia-dental` | Owner/name: only this repository's `production` environment may deploy |
| `trustProxyHops` | `2` | Leave it until step 10 |
| `appEnv`, `demoLogins` | `production`, `false` | See the go-live checklist before changing |
| `demoDailyReset` | `false` | Only for the client demo (`appEnv=demo`, `demoLogins=true`): wipes and reseeds every night at 03:40 Manila, and seeds an empty database at start-up |
| `databaseRequireTls` | `false` | Leave it until step 7.4 ("Database TLS and the app user"): then `true` |
| `apiDatabaseUser` | `master` | Leave it until step 7.4: then `app`. The first release task creates the app user |
| `waf` | `true` | AWS WAF on the load balancer (about US$8 a month). `false` only to save that cost on a throwaway demo |

Check: `cdk synth -q` exits 0. It names any setting that is missing or wrong.

## 2. GitHub's OIDC provider

Run `aws iam list-open-id-connect-providers`. If the list already has one ending in
`token.actions.githubusercontent.com`, copy its ARN into `githubOidcProviderArn`. An account can hold only one.

## 3. Bootstrap CDK

CDK's bootstrap creates the role CloudFormation deploys with. Without `--cloudformation-execution-policies` that role
gets `AdministratorAccess`, and every deploy, including the GitHub deploy role's, runs as administrator. Give it
Primolar's scoped policy instead (`packages/infra/policies/cfn-execution.json`: the services the stacks use, IAM only on
`primolar-*` / `Primolar*` roles).

1. Create the policy, once per account:
   ```
   aws iam create-policy --policy-name primolar-cfn-execution --policy-document file://packages/infra/policies/cfn-execution.json
   ```
2. Bootstrap with it:
   ```
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   cdk bootstrap aws://$ACCOUNT/ap-southeast-1 --cloudformation-execution-policies arn:aws:iam::$ACCOUNT:policy/primolar-cfn-execution
   ```
3. Check: `aws iam list-attached-role-policies --role-name cdk-hnb659fds-cfn-exec-role-$ACCOUNT-ap-southeast-1` lists
   only `primolar-cfn-execution`.

**An account bootstrapped before this policy existed:** run steps 1 and 2 as they are. Re-running `cdk bootstrap`
with the new flag updates the `CDKToolkit` stack in place and replaces `AdministratorAccess` on the role. Then check as
in step 3.

**When the policy changes** (a new kind of resource in the stacks; `test/cfn-execution-policy.test.ts` names it):
```
POLICY=arn:aws:iam::$ACCOUNT:policy/primolar-cfn-execution
aws iam create-policy-version --policy-arn $POLICY --policy-document file://packages/infra/policies/cfn-execution.json --set-as-default
```
IAM keeps five versions: delete the oldest first if it refuses (`aws iam list-policy-versions`, `delete-policy-version`).
A deploy that fails with `AccessDenied` in the stack's events names the missing action.

## 4. Deploy the foundation (about 20–30 minutes)

`cdk deploy PrimolarFoundation`. Read the list of IAM changes it shows, then answer `y`.

- **The certificate waits for you.** While the deploy shows `AWS::CertificateManager::Certificate … CREATE_IN_PROGRESS`:
  1. `aws acm list-certificates --query "CertificateSummaryList[?DomainName=='<apiDomain>'].CertificateArn" --output text`
  2. `aws acm describe-certificate --certificate-arn <arn> --query "Certificate.DomainValidationOptions[0].ResourceRecord"`
  3. Add that CNAME (name → value) at your DNS host. Validation takes 5–30 minutes; the deploy then continues.
  - Already have a certificate for the domain in `ap-southeast-1`? Put its ARN in `certificateArn` before deploying.
- **Confirm the email** "AWS Notification – Subscription Confirmation" sent to `alertEmail`. Without it, no alarm or
  budget mail arrives.
- Note the outputs. Show them again with
  `aws cloudformation describe-stacks --stack-name PrimolarFoundation --query "Stacks[0].Outputs"`.
- It also generates two secrets you never type: `primolar/origin-secret` (step 9 copies it to Vercel) and
  `primolar/database-app` (the API's own MySQL user, step 7.4). MySQL's error and slow-query logs go to CloudWatch
  (`/aws/rds/instance/<id>/error`, `…/slowquery`, 90 days); the load balancer's and the files bucket's access logs go to
  the `…accesslogs…` bucket (90 days).

## 5. Semaphore (can wait until Semaphore approves the account)

- Until then, leave `semaphoreSecretArn` and `smsSenderName` empty. Texts go to the log driver, which is safe (B9
  decision 11).
- Once Semaphore has approved the account:
  1. Run `aws secretsmanager create-secret --name primolar/semaphore-api-key --secret-string '<key>'`.
  2. Put the returned ARN in `semaphoreSecretArn`.
  3. Once the sender name is approved, set `smsSenderName` to `PRIMOLAR`.
- The change goes out with the next deploy (step 7).

## 6. GitHub environment

Repository → Settings → Environments → **New environment** `production`:

- Deployment branches: `master` only.
- Optional: yourself as a required reviewer, so each deploy waits for your click.
- **Variables:** add `AWS_DEPLOY_ROLE_ARN` = the foundation's `DeployRoleArn` output. No AWS keys are stored anywhere.

## 7. First deploy

1. Commit `cdk.json`, open a PR, merge to `master`, and wait for the `check` workflow to pass.
2. Actions → **deploy** → Run workflow → branch `master`, `image_tag` empty.
3. The first run creates `PrimolarService` (about 10–15 minutes). It starts the API on the new image a minute before
   the first migration runs, so one "unhandled errors" alarm email is possible. Ignore that one.
4. **Database TLS and the app user.** The release task has now created the API's own MySQL user (`primolar_app`:
   SELECT, INSERT, UPDATE, DELETE on the schema; it runs `CREATE USER IF NOT EXISTS …` before every migration, signed in
   as the master user). Switch to it, and make RDS refuse connections without TLS:
   1. In `cdk.json`, set `apiDatabaseUser` to `app` and `databaseRequireTls` to `true`. Merge to `master`.
   2. `cdk diff PrimolarFoundation` shows only the parameter group's `require_secure_transport` changing to `1`. Then
      `cdk deploy PrimolarFoundation` (a dynamic parameter: no reboot).
   3. Actions → **deploy** → Run workflow, `image_tag` = the tag running now (`ImageTagInUse` output). The services
      restart as `primolar_app`.
   4. Check: `/api/health/ready` answers 200 (step 8), and CloudWatch → Logs Insights on `/primolar/api` shows no
      `Access denied` or `insecure transport` in the last 15 minutes.

   Why two deploys: until the release task has run once, the app user doesn't exist, and a service that signs in as it
   never turns healthy. The release task signs in as the master user always (migrations change the schema).

## 8. Point the domain at the load balancer

1. Get the `LoadBalancerDnsName` output:
   `aws cloudformation describe-stacks --stack-name PrimolarService --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text`.
2. At your DNS host, add a CNAME: `<apiDomain>` → that name.
3. Check. The load balancer answers 403 to anything without the origin header (#2), so take it from the secret:
   ```
   ORIGIN=$(aws secretsmanager get-secret-value --secret-id primolar/origin-secret --query SecretString --output text)
   curl -fsS -H "X-Primolar-Origin: $ORIGIN" https://<apiDomain>/api/health/ready   # {"status":"ok",…}
   curl -s -o /dev/null -w "%{http_code}\n" https://<apiDomain>/api/health/ready     # 403
   curl -sI http://<apiDomain>/api/health/live                                      # 301
   unset ORIGIN
   ```

## 9. Vercel

Project → Settings → Environment Variables → **Production**:

- `API_PROXY_TARGET` = `https://<apiDomain>`. The web's `/api/*` proxy (`apps/web/src/middleware.ts`) sends the
  browser's calls there, same-origin, so cookies work without CORS.
- `ORIGIN_SECRET` = the value of `primolar/origin-secret`
  (`aws secretsmanager get-secret-value --secret-id primolar/origin-secret --query SecretString --output text`).
  Mark it **Sensitive**. The proxy adds it as `X-Primolar-Origin`; without it the load balancer and the API answer
  403. Same environments as `API_PROXY_TARGET`. Never a `NEXT_PUBLIC_` name: it must stay on the server.
- `NEXT_PUBLIC_API_MOCKING` = `disabled`, for Production and Preview (B13c1: no deployment runs MSW).

Then redeploy the web, and sign in on it once.

## 10. Measure `TRUST_PROXY_HOPS` (B13a Q3)

The rate limits key on the client's address, and Express finds it by counting hops from the right of
`X-Forwarded-For`.

1. Find your public address: `curl -s https://checkip.amazonaws.com`.
2. Load the web's sign-in page and sign in once.
3. CloudWatch → Logs Insights → log group `/primolar/api`, last 15 minutes:
   ```
   fields @timestamp, req.url, `req.headers.x-forwarded-for` as xff
   | filter ispresent(xff) and xff like /<your address>/
   | sort @timestamp desc | limit 10
   ```
4. In `xff`, count from the **right** to your address. The rightmost entry is 1.
   - `"<you>, <vercel>"` means 2.
   - `"<you>"` alone means 1.
5. Put that number in `trustProxyHops`. Merge, then run **deploy**.
6. Optional proof: 21 wrong sign-ins from your connection get `429`, while another network (a phone on mobile data)
   still gets `401`.
7. The count can't be gamed from outside: a caller that skips Vercel to write its own `X-Forwarded-For` has no
   origin secret, so the load balancer answers 403 and the API refuses it too (#2, closing decisions.md I11). Measure
   again whenever the web's proxy changes (the move from a `next.config.ts` rewrite to `src/middleware.ts` is such a
   change).

## Changing the origin secret

If it may have leaked (it sits in Vercel, in Secrets Manager and in the load balancer's rule, which anyone allowed
`elasticloadbalancing:DescribeRules` can read). Expect a few minutes of 403s between steps 2 and 4.

1. `aws secretsmanager put-secret-value --secret-id primolar/origin-secret --secret-string "$(openssl rand -hex 32)"`.
2. Vercel → `ORIGIN_SECRET` = the new value; redeploy the web.
3. The load balancer's rule: CloudFormation resolves the secret only when it changes the rule, so set it by hand (a
   later deploy that touches the rule reads the same value):
   ```
   ORIGIN=$(aws secretsmanager get-secret-value --secret-id primolar/origin-secret --query SecretString --output text)
   LB=$(aws elbv2 describe-load-balancers --query "LoadBalancers[?DNSName=='<LoadBalancerDnsName>'].LoadBalancerArn" --output text)
   LISTENER=$(aws elbv2 describe-listeners --load-balancer-arn "$LB" --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
   RULE=$(aws elbv2 describe-rules --listener-arn "$LISTENER" --query "Rules[?Priority=='10'].RuleArn" --output text)
   aws elbv2 modify-rule --rule-arn "$RULE" --conditions "Field=http-header,HttpHeaderConfig={HttpHeaderName=X-Primolar-Origin,Values=[$ORIGIN]}" > /dev/null
   unset ORIGIN
   ```
4. The tasks read `ORIGIN_SECRET` at start: `aws ecs update-service --cluster primolar --service api --force-new-deployment`,
   and the same for `api-web` if it runs tasks.
5. Check as in step 8.

## Upgrading a deployment set up before the origin lock, TLS to RDS and the app user

In this order; each step's check before the next. Between steps 5 and 6 nothing breaks: the old API ignores the
header, and RDS still accepts connections without TLS.

1. Step 3 above: create the policy and bootstrap again with it.
2. Merge the change. `cdk.json` comes with `databaseRequireTls=false` and `apiDatabaseUser=master`: keep them for now.
   Vercel redeploys the web; its new `/api` proxy works without `ORIGIN_SECRET` too.
3. `cdk diff PrimolarFoundation`, then `cdk deploy PrimolarFoundation`. New: the two secrets, the access-log bucket,
   RDS log exports, the slow-query parameters, and the API tasks' outbound rules (HTTPS and MySQL only).
4. Step 9's `ORIGIN_SECRET` in Vercel, then redeploy the web.
5. Actions → **deploy** with `image_tag` empty (the new image: TLS to RDS, the origin check). The load balancer now
   answers 403 without the header. The release task creates `primolar_app`.
6. Step 7.4 (the app user and `require_secure_transport`), then step 8's checks and step 10 (measure the hops again).

## 11. Next

Enrol the operator in two-step sign-in (security review #8; production refuses the console without it): a one-off run of the release task, as in [rollback.md](rollback.md), with the command `node dist/operator-totp.mjs <operator email>`. Add the printed `otpauth://` URI to an authenticator app, then delete that run's log stream in CloudWatch (it holds the secret). Locally: `pnpm --filter api exec node --import @swc-node/register/esm-register prisma/operator-totp.ts <email>`.

Run the [restore drill](restore-drill.md) once, then work through the [go-live checklist](go-live-checklist.md).
