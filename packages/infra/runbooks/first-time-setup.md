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

Check: `cdk synth -q` exits 0. It names any setting that is missing or wrong.

## 2. GitHub's OIDC provider

Run `aws iam list-open-id-connect-providers`. If the list already has one ending in
`token.actions.githubusercontent.com`, copy its ARN into `githubOidcProviderArn`. An account can hold only one.

## 3. Bootstrap CDK

`cdk bootstrap aws://<ACCOUNT_ID>/ap-southeast-1`. This creates CDK's staging bucket and roles, once per account and
region.

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

## 8. Point the domain at the load balancer

1. Get the `LoadBalancerDnsName` output:
   `aws cloudformation describe-stacks --stack-name PrimolarService --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDnsName'].OutputValue" --output text`.
2. At your DNS host, add a CNAME: `<apiDomain>` → that name.
3. Check:
   - `curl -fsS https://<apiDomain>/api/health/ready` answers `{"status":"ok",…}`.
   - `curl -sI http://<apiDomain>/api/health/live` answers `301`.

## 9. Vercel

Project → Settings → Environment Variables → **Production**:

- `API_PROXY_TARGET` = `https://<apiDomain>`. Next's `/api/*` rewrite (`apps/web/next.config.ts`) sends the browser's
  calls there, same-origin, so cookies work without CORS.
- `NEXT_PUBLIC_API_MOCKING` = `hybrid` until B13c moves it to `disabled`.

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
7. A caller that skips Vercel and calls `<apiDomain>` directly can still choose its address
   (decisions.md I11, follow-up).

## 11. Next

Run the [restore drill](restore-drill.md) once, then work through the [go-live checklist](go-live-checklist.md).
