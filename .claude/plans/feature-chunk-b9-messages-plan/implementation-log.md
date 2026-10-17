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
