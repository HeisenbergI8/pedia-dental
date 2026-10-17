# Implementation log: Chunk B9, parent messages and real sending

Plan: `feature-chunk-b9-messages-plan.md`. One entry per phase, in B8's shape. Record deviations from the plan as they
happen, with the reason; "none" when there are none. Record every `pnpm --filter api test:int <file>` run by hand:
`test:int` isn't on the check allowlist, so the plan's `test -f` gates prove only that a file exists.

## Decisions settled with the user — 2026-10-17 (`decisions.md`)

1. SMS only, through Semaphore; dev and tests use a log-only driver. No email in B9.
2. One platform-owned Semaphore account; monthly allowances per plan come in B12.
3. One shared sender name (`PRIMOLAR`); the clinic's name is in the body.
4. Texts go out only 8 AM–8 PM Asia/Manila; anything due outside waits until 8 AM.
5. 3 retries (~1 min, 5 min, 30 min), then `failed` with the reason, shown in `/messages`. No Resend button.
6. The primary guardian's phone only.
7. Cancelled appointment → unsent texts withdrawn (`cancelled`); moved → old reminder withdrawn, a new one queued.
8. Birthday greetings: automatic daily job each morning, once per child per calendar year; the manual button stays.
9. Recall / due-item texts stay manual.
10. Count texts per clinic per month; never block in B9.
11. The log driver everywhere, production included, until a Semaphore API key is configured.
12. No usable phone → fails at once as "No phone number", no retries.

**Open for the user** (plan → Follow Ups → Questions 1–6, written to the recommendations): in-doubt sends aren't
resent; count texts and parts, shown from B12; `to` stays visible as in the demo; suspended clinics get no birthday
job but queued texts still go; Semaphore's contract and sender approval to confirm; a move also sends a new
confirmation.

Engineering decisions E1–E14 as the plan records them.

<!-- Template for each phase:
## Phase N: <name> — YYYY-MM-DD

**Steps completed:**
**Files changed:**
**Deviations from plan:**
**Gate:** `pnpm run check` (exit, test files counted) · `pnpm --filter api test:int <files>` (exit)
-->

## Phase 1: Shared rules and the mock — 2026-10-17

**Steps completed:** 1.1, 1.2, 1.3.
**Files changed:** `packages/shared/src/domain/{messages,messages.test,sending,sending.test}.ts`, `packages/shared/src/index.ts`,
`packages/seed/src/message-templates.ts`, `apps/web/src/mocks/{outbox,handlers.test}.ts`.
**Deviations from plan:** the 9 PM case pins only `Date` to today's 9 PM (a clock years ahead outlives the demo session) and
books its own slot (2030-04-09) so it can't clash with earlier cases. Seed guardian phones are all `09\d{9}`: no seed fix.
Semaphore's docs host can't be reached from this container (DNS); the driver's contract stays to confirm before going live.
**Gate:** `pnpm run check` exit 0 (shared 207, seed 22, web 358, api 325).

## Phase 2: The `Message` table — 2026-10-17

**Steps completed:** 2.1, 2.2, 2.3.
**Files changed:** `apps/api/prisma/schema.prisma`, `prisma/migrations/20261017072141_messages/`, `src/prisma/{model-scope,tenant-scope.test}.ts`,
`src/message-queue/message.rows{,.test}.ts` (new), `src/seed/seed-database.ts`, `test/int/seed.int.test.ts`.
**Deviations from plan:** `MESSAGE_SEND` lives in `message.rows.ts` (the seed needs it before Phase 4's service exists);
`messageData` also takes `sentAt`/`segments`, so seeded `sent` rows count in their month (Potential Issues).
**Gate:** `pnpm run check` exit 0 · `pnpm --filter api test:int test/int/seed.int.test.ts` 12 passed.

## Phase 3: Outbox retries per kind, deferral, dead letters — 2026-10-17

**Steps completed:** 3.1, 3.2.
**Files changed:** `apps/api/src/outbox/{outbox.handlers,outbox.worker,outbox.worker.test}.ts`, `test/int/outbox.int.test.ts`.
**Deviations from plan:** the test handlers are plain objects registered on both apps (the lost-lease case needs B's).
Deferral case moves `until` each round. Mutations: dropping `attempts: { decrement: 1 }` → deferral case red; dropping
`settled &&` → lost-lease hook case red.
**Gate:** `pnpm run check` exit 0 (api 329) · `pnpm --filter api test:int test/int/outbox.int.test.ts` 12 passed.

User answers after planning: Q13–Q17 as recommended; Q18 (sender name) open — see `decisions.md`.

## Phase 4: `MessageQueueModule` — 2026-10-17

**Steps completed:** 4.1, 4.2, 4.3.
**Files changed:** `apps/api/src/message-queue/{message-queue.service,message-queue.module}.ts` (new),
`src/messages/messages.module.ts`, `src/patients/patients.module.ts`, `test/int/message-queue.int.test.ts` (new).
Also restored `test/int/outbox.int.test.ts` to the repo's long-line style (Phase 3's commit had run Prettier on it; the
repo has no Prettier config): same cases, no behaviour change.
**Deviations from plan:** `queueBooking` takes a `Pick<Appointment, …>` (callers in Phase 6 hold rows, not full contracts).
The int file uses the seeded child objects as the `Patient` argument and orders rows by kind (one fixed clock gives every
row the same `createdAt`). Mutations: withdrawal without `dispatchedAt: null` → withdraw case red; consent check removed →
declined case red.
**Gate:** `pnpm run check` exit 0 · `pnpm --filter api test:int test/int/message-queue.int.test.ts test/int/outbox.int.test.ts` 8 + 12 passed.

## Phase 5: Providers and the send handler — 2026-10-17

**Steps completed:** 5.1, 5.2, 5.3, 5.4.
**Files changed:** `apps/api/src/message-queue/{sms-provider,log-sms.provider,log-sms.provider.test,semaphore-sms.provider,semaphore-sms.provider.test,message-send.handler,message-queue.module}.ts`,
`src/config/env.ts`, `.env.example`, `test/int/message-sending.int.test.ts` (new), `test/int/message-queue.int.test.ts` (guard removed).
**Deviations from plan:** `SMS_SENDER_NAME` has no default and is optional (decision 18 is open): unset, the form carries
no `sendername`. Semaphore's docs host isn't reachable from this container, so the contract stays unconfirmed (Question 5).
The int file spies on each app's real `SMS_PROVIDER` instead of overriding the provider, so `int-app.ts` is unchanged. The
withdraw-vs-claim case holds the row with the claim's own statements in a test transaction. Mutations: dropping the
`status !== "queued"` skip → restart, withdrawn and withdraw-vs-claim cases red; dropping the `dispatchedAt` in-doubt branch
→ the left-no-outcome case red.
**Gate:** `pnpm run check` exit 0 · `pnpm --filter api test:int test/int/message-sending.int.test.ts test/int/message-queue.int.test.ts` 11 + 8 passed.
**Correction:** Phase 5's commit (f65e525) went in with `pnpm run check` red: `env.test.ts`'s defaults case didn't know
`SEMAPHORE_URL`. Fixed in the next commit; check exit 0 after it (api 341).
