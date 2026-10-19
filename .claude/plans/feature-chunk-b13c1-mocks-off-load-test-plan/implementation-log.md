# Implementation log: B13c1 mocks off, the port ledger, the API-backed demo and the load test

## Step 1.1, Step 1.3 and Phase 4 — 2026-10-18

**Steps completed:** 1.1 (harness), 1.3, 4.1, 4.2, 4.3, 4.4 (code; the e2e run is pending, see below)
**Files changed:** `apps/api/test/port-ledger{,.test}.ts` (new), `apps/web/src/mocks/passthrough.test.ts`, `apps/web/src/features/auth/demo{,.test}.ts` (new), `features/auth/api.ts`, `features/auth/components/{login-screen,switch-user-dialog,account-menu}.tsx`, `features/operator/components/operator-login.tsx`, `features/portal/api.ts`, `apps/web/.env.example` (new), `apps/web/.gitignore` (`!.env.example`), `README.md`, the six `api-*.spec.ts` start-up lines, `api-sign-in.spec.ts`, `apps/api/src/metrics/metrics.service.ts` (Q4 comment)
**Deviations from plan:**
- **The sweep found a second rule with no route:** `GET /audit-log` (`audit.view`, in both access maps) has no MSW handler, no API controller and no screen, like `POST /patients/:id/exports`. The rules sweep now expects both and names them as B13c2's (the audit-log reader belongs with the privacy work).
- **The sweep's handler filter** also skips handlers whose method is a RegExp: the access gate's `/.+/` catch-all.
- **`ENFORCED` starts empty** in this commit. The five small files join in Step 1.2 once their lines are confirmed against the test bodies, so `pnpm run check` stays green between commits.
- **`apps/web/.env.example`** was git-ignored by `apps/web/.gitignore`'s `.env*`; `!.env.example` was added so it can be committed.
- **The README's Run it section** also starts MySQL and seeds, as the plan's list implies.
**Gate:** `pnpm run check`: exit 0. `port-ledger.test.ts`: 2 passed, 13 todo. `passthrough.test.ts`: 7 passed.
**Notes:**
- The case mapping for all 13 web files is being proposed by five read-only agents into the scratchpad. Each line is confirmed against the test bodies before it lands.
- The Phase 4 e2e gate (every `api-*.spec.ts` against a `disabled` web) runs with Phase 5's demo-script spec.

## Phase 5 (5.1, 5.2, 5.3, 5.5) — 2026-10-18

**Steps completed:** 5.1, 5.2, 5.3, 5.5. Step 5.4 (the demo-script spec) follows separately.
**Files changed:** `apps/api/src/config/env{,.test}.ts`, `apps/api/.env.example`, `src/seed/{demo-reset,demo-reset.test,demo-reset.jobs,demo.module}.ts` (new), `src/app.module.ts`, `prisma/demo-reset.ts` (new), `package.json` (`db:demo-reset`), `tsconfig.json`, `test/int/seed.int.test.ts`, `DEMO_SCRIPT.md`, `packages/infra/{src/config.ts,src/service-stack.ts,cdk.json,test/config.test.ts,test/service-stack.test.ts,runbooks/first-time-setup.md}`
**Deviations from plan:**
- **The int case "resets a seeded demo database …"** changes Bulilit's account name, standing in for "adds a patient" (a patient row needs a full guardian graph). It asserts the name is restored, the patient count equals the seed's, and the `JobLock` row stays.
- **The start-up case** builds `JobRunner(prisma, new SystemClock())` directly and uses `APP_ENV=local` with `DEMO_LOGINS=true` (allowed by `assertResetAllowed`). It reseeds at the end, so the file leaves the database as it found it.
- **`demo-reset.test.ts`'s fake** `$executeRawUnsafe` takes a `sql` parameter, so `mock.calls[i][0]` typechecks.
**Gate:**
- `pnpm run check`: exit 0. `@pedia/infra`: 41 tests.
- `vitest --config vitest.int.config.ts test/int/seed.int.test.ts`: 17 passed on MySQL.

## Phase 6: The load test — 2026-10-19

**Steps completed:** 6.1, 6.2, 6.3, 6.4
**Files changed:** `apps/api/test/load/{targets,targets.test,load-data,load-data.test,run}.ts` (new), `apps/api/prisma/load-seed.ts` (new), `apps/api/package.json` (autocannon 8.0.0, @types/autocannon; `load:seed`, `load:run`), `tsconfig.json`, `README.md` (Load test), `src/patients/patient-standing.ts` (the fix below), `pnpm-lock.yaml`
**Deviations from plan:**
- **`loadPlatform`'s builders** copy the seeded records' field sets (Q7):
  - Patient numbers are `KS-90000…`, because the contract's regex is `KS-\d{5}`; the plan's `LD-…` would fail `Patient.parse`.
  - Dates come from the patient's index, not faker: `@faker-js/faker` is a dependency of `@pedia/seed`, not of the API.
  - `loadPlatform(extra, today)` takes the day, so the unit test is fixed in time.
- **`run.ts`** imports `clinic-time` first, signs in with `DEMO_PASSWORD` from `@pedia/seed`, and picks Imus by name. Autocannon 8's `Result` has `latency.p97_5`, `requests.average`, `non2xx`, `errors` and `timeouts`, as the plan assumed.
- **A fix found by the first run (`patient-standing.ts`):** `standingPage` passed every invoice, payment and text in the clinic to `patientStanding` for each patient, O(patients × rows). Each patient now gets its own rows, grouped once, with payments grouped by their invoice's owner. The answer is unchanged, because `patientStanding` filtered by patient and `invoiceBalance` by invoice; `src/patients`' 31 tests pass. One warm request at 5,000 patients went from 1,011 ms to 641 ms.
**Run (4 vCPU, 15 GB, MySQL 8.0.46 here; production runs 8.4), production bundle, `BACKGROUND_WORK=true`, 10 connections, 30 s after 5 s warm-up:**

At 5,000 extra patients (5,061 in Bulilit), after the fix:

| Target | Requests | req/s | p50 | p97.5 | p99 | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Today (Imus) | 551 | 18.4 | 513 | 842 | 877 | missed |
| Today (all branches) | 638 | 21.3 | 459 | 605 | 641 | missed |
| Patient list | 19 | 0.6 | 8458 | 9197 | 9197 | missed, 22 timeouts |
| Patient list: balance due | 0 | 0 | — | — | — | missed, 60 timeouts |
| Search | 175 | 5.8 | 1448 | 5750 | 6186 | missed |
| Book | 842 | 28.1 | 348 | 436 | 453 | missed (p97.5) |

At 1,000 extra patients:

| Target | Requests | req/s | p50 | p97.5 | p99 | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Today (Imus) | 1908 | 63.6 | 152 | 206 | 223 | OK |
| Today (all branches) | 1768 | 58.9 | 161 | 235 | 301 | OK |
| Patient list | 249 | 8.3 | 1156 | 2279 | 2284 | missed |
| Patient list: balance due | 250 | 8.3 | 1137 | 1551 | 1573 | missed |
| Search | 1034 | 34.5 | 280 | 396 | 428 | missed (p97.5) |
| Book | 948 | 31.6 | 311 | 373 | 390 | OK |

**Gate:** `load:run` exits 1 at both sizes. The misses are accepted by the user and moved to a Later chunk (decisions.md L1); the thresholds are unchanged. `pnpm run check` before the commit, exit code below.
**Why the list is slow:** every page computes the standing of every patient who matches. With no search, that is the whole clinic: four `IN (5,000 ids)` queries plus the JS. One request takes about 0.6 s; under 10 connections they queue. `GET /patients` (search) returns every match unpaged: "ma" returned 762 KB at 5,000 patients.

## Phases 1–3: the port ledger for all 13 files — 2026-10-19

**Steps completed:** 1.2, 2.1, 2.2, 3.1, 3.2
**How:**
- **Mapping:** five read-only agents mapped the web cases to API tests, reading both test bodies, into scratch files: small, access, primolar, and handlers.test.ts in two halves.
- **New tests:** five more agents, each in its own git worktree with its own `pedia_dental_<group>_test` database, wrote the API cases the mapping found missing, and ran their files green. None changed API source, and none found a contract difference.
- **Merge:** their branches merged into this one. Three import-line conflicts were resolved by keeping both sides.
- **The ledger:** the fragments were assembled into `PORT_LEDGER`. `ENFORCED` is now all 13 files. The `it.todo` loop is replaced by "enforces all 13 files".
**Added by group:**

| Group | New cases | Extended cases |
| --- | --- | --- |
| small | 5 | 6 |
| access | 7 | 13 |
| primolar | 16 | 12 |
| handlers1 | 1 | 4 |
| handlers2 | 9 | 8 |

handlers2 also hoisted `parent-ownership`'s `it.each` table, so the parser reads its title.
**Deviations:**
- **primolar's G2 stub route** is `GET /signups/x/unruled`, because `/signups/unruled` matched the public `/signups/:reference` rule.
- **primolar's G13 sweep** skips the two rules that have no controller: `POST /patients/:id/exports` and `GET /audit-log`. These are the same two found in Step 1.3, and both are B13c2's.
- **photos.int's re-seeding case** has a 60 s timeout.
**Gate:**
- `pnpm run check`: exit 0. `port-ledger.test.ts`: 16 passed, all 13 files enforced.
- `pnpm --filter api test:int`: 53 files, 607 tests passed (was 568).

## Step 5.4 and the Phase 4 gate — 2026-10-19 (agent run, commit f4b25c5)

**Steps completed:** 5.4; the Phase 4 e2e gate
**Files changed:** `apps/web/e2e/api-demo-script.spec.ts` (new), `apps/web/e2e/api-photos-documents.spec.ts`, `apps/web/src/features/auth/components/{login-screen,access-gate}.tsx`
**Results** (fresh database, mocks off; the web on :3200, the API on :4160):
- `api-demo-script.spec.ts`: 10 of 10 (sections 0–9, 2.2 min, 13 sign-ins). Section 9's X-ray uploads and opens at `/api/files/<token>`.
- Every other `api-*.spec.ts` against the `disabled` web:

  | Spec | Passed |
  | --- | --- |
  | billing | 8 |
  | chart | 3 |
  | messages | 7 |
  | notes-plan | 4 |
  | operator | 5 |
  | owner-settings | 7 |
  | patients | 5 |
  | photos-documents | 6 |
  | portal | 4 |
  | scheduling | 5 |
  | sign-in | 10 |
- `api-sign-in.spec.ts` with `E2E_MOCKING=hybrid` against a hybrid web (:3210): 10.
**Product fix found by the run:**
- **Symptom:** with mocks off, `/login` with a stored session but no cookie hung on "Signing you in".
- **Cause:** the first client render after SSR read the session as empty, then took the stored session for a sign-in in progress.
- **Fix:** `login-screen.tsx` reads the session it opened with from the store, comparing only once the store is hydrated (`useHydrated`, now exported from `access-gate.tsx`).
**Spec fix:** `api-photos-documents.spec.ts`'s first case accepts the API's 302 to a file link with mocks off, or hybrid's 200 PNG (MSW follows the redirect). The image-loads assertion is unchanged.
**Notes:**
- The installed Playwright 1.64 expects a newer browser than `/opt/pw-browsers` holds, so the run used a temporary config pointing at chromium-1194, with one worker. That config was deleted afterwards.
- Seed with `STORAGE_DIR` set to the API's storage, so the seeded photos have their files.
- Start the API with `WEB_URL` pointing at the web, for `api-portal`'s links.

## Phase 7: Documentation — 2026-10-19

**Steps completed:** 7.1, 7.2
**Files changed:** `CONVENTIONS.md` (current phase, commands, traps: demo help follows the API, a new route needs both sides, `localStorage` only in `enabled`; "the NestJS backend" off the deferral list), `apps/api/CONVENTIONS.md` (current phase, commands, traps: `DEMO_DAILY_RESET`, "ported" is the ledger, `_load`), `apps/api/CHUNKS.md` (B13c1 ✅, B13c2 listed with the audit-log reader, "Done when" note, the Later chunk), `packages/infra/runbooks/go-live-checklist.md` (B13c1's three checks; DPA line now B13c2's)

## Go-live for the client demo (owner's steps)

1. **`packages/infra/cdk.json`:** `appEnv` = `demo`, `demoLogins` = `true`, `demoDailyReset` = `true`. Deploy; the empty RDS gets seeded at start-up.
2. **Vercel, Production and Preview:**
   - `NEXT_PUBLIC_API_MOCKING=disabled`;
   - `API_PROXY_TARGET=https://<apiDomain>`;
   - then redeploy. Today `primolar.vercel.app` still runs MSW.
3. **After a reset:** run `E2E_API=1 E2E_BASE_URL=https://<demo web> npx playwright test e2e/api-demo-script.spec.ts --project=desktop`. This closes B13's "Done when", and its X-ray is the real-S3 check left from B10.
4. **Optionally:** `LOAD_RECORD_ONLY=1 LOAD_BASE_URL=https://<apiDomain> pnpm --filter api load:run` at demo size, recorded only.
5. **Before real clinics:** a fresh database, `appEnv` = `production`, `demoLogins` and `demoDailyReset` = `false` (go-live checklist).

## Auditor fixes — 2026-10-19

The auditor scored 71/100.
- **1, high: section 9 of the demo-script spec would fail on the S3-backed demo.** The opened tab may now be either the local driver's `/api/files/<token>` or a presigned bucket link: an `*.amazonaws.com` host with an `X-Amz-Signature` parameter. The content-type check is unchanged.
- **2, medium: the docs understated the load misses.** CHUNKS, the go-live checklist and API CONVENTIONS now say every target missed at 5,000 patients, and the list and search already miss at 1,000. That matches the log's tables and L1.
- **3, low:** API CONVENTIONS "Decisions recorded" gains B13a, B13b and B13c1 summaries.
- **4, low:** the ledger's 86 `// GAP: see *.gaps.md` comments, which pointed at scratch files, now read `// was a gap: written for B13c1`.
- **5, low: stale wording.**
  - The `env.ts` comment on `apiMocking`.
  - The root CONVENTIONS data-flow line.
  - The `DEMO_SCRIPT.md` intro ("prototype").
  - Four `api-*.spec.ts` headers and every skip message, which said "hybrid".
- **6, low:** infra's vitest config sets `hookTimeout: 60_000`, so synthesis in `beforeAll` doesn't time out on a busy machine.
- **Smells left as is:** the e2e helpers repeated across specs, and the ledger's string value.
**Gate:** `pnpm run check`: exit 0.
