# Verification: B9 (parent messages and real sending)

**Status:** run 2026-10-17. The tester's live results and its two defects (D1, D2, both fixed in cda8e47) are appended
at the end. The auditor scored the work 79/100 and ran 10 mutations (rows 1, 8, 10, 12, 13, 15–19): nine were caught.
Row 1 (the booking's texts outside its transaction) survived until `appointments.int` gained "saves a booking and its
texts together, or neither", which fails an outbox write mid-booking; with the texts moved to a second transaction it
goes red. Row 2: the brute-force races never reached the window; `messages-races.int`'s deterministic lock case is the
one that goes red. Rows 4 and 9 were run against `message-queue.int` and `outbox.int`. The table below is the plan's;
these notes correct it.

## Checks to run

| Check | Expected | Evidence |
| --- | --- | --- |
| `pnpm run check` | exit 0. New test files ran (count them: `--passWithNoTests` hides a missing file): `sending.test.ts`, `message.rows.test.ts`, `log-sms.provider.test.ts`, `semaphore-sms.provider.test.ts`; new cases in `messages.test.ts`, `outbox.worker.test.ts`, `handlers.test.ts` "parent messages", `patient-standing.test.ts`, `passthrough.test.ts` | |
| `pnpm --filter api test:int` | exit 0, every file; `privacy.int`'s two B9 `it.todo`s are tests now | |
| `node .claude/harness/verify-plan.mjs <plan> --strict` | exit 0 | |
| Done-when 1: one confirmation, exactly once across a worker restart | `message-sending.int` case 1: one provider call, `sent`, outbox `done` | |
| Done-when 2: a declined consent sends nothing | `message-queue.int` case 3; `privacy.int` (84); e2e test 3 | |
| Done-when 3: a failed send retries, then shows as failed | `message-sending.int` case 3: 4 tries at +0, +1, +5, +30 min, then "Couldn't be sent after 4 tries"; e2e shows a `Failed` row with its reason (test 5) | |
| Same transaction | a refused booking leaves 0 messages and 0 outbox rows; `message-queue.int` case 5 | |
| Sending hours | 21:30 queue → 08:00; a 20:00 retry deferred without spending a try (`message-sending.int` 7) | |
| Withdrawals | cancel, move, no-show, reminders "no": only `queued` + undispatched rows → `cancelled`; a sibling's untouched | |
| Races | `messages-races.int` 1–4 and the birthday ×10 case: assertions hold, zero 5xx | |
| Birthday job | one greeting per child per Manila year across two instances; suspended clinic none; Jan 1 00:30 edge | |
| Monthly count | `sentIn` texts and parts per clinic; another clinic 0 | |
| Access matrix: 3 routes × {anon, parent own/other child, front desk, dentist, admin, Bulilit Owner, Ngiti Owner} | per the plan's inventory; parent POSTs 403 | |
| Refusal order and words | due-item and birthday routes: each refusal reached once, in the mock's order, exact text | |
| No patient data in logs | log driver line and worker warnings carry ids, part counts and error names only (grep a run's log for a seeded phone and child name: no hits) | |
| noContact / Today | list parity with `patientStanding` over the seed's messages (some rows true); Today's greeting tick after a greeting | |
| Playwright `e2e/api-messages.spec.ts`, desktop, fresh database, twice | green both runs; asserted responses carry `x-request-id` | |
| B7/B8 e2e re-run | `api-scheduling.spec.ts`, `api-billing.spec.ts` green | |

## Mutation checklist (each must turn the named test red; revert with `git checkout` after each)

| Mutation | Expected red |
| --- | --- |
| `queueBooking` moved out of `book`'s transaction (after it commits) | appointments.int "refused booking leaves nothing" / message-queue.int 5 |
| `lockPatient` removed from `move` | messages-races 1 |
| `withdrawPatient` removed from `changeChoices` | privacy.int (93); e2e test 4 |
| `WITHDRAWABLE` without `dispatchedAt: null` | message-sending.int 9 (a dispatched text flips to `cancelled` after it was sent) |
| `choiceDeclined` check removed from `queue` | message-queue.int 3; privacy.int (84) |
| the handler's `status !== "queued"` skip removed | message-sending.int 1 (two calls), 8 |
| the handler resends when `dispatchedAt` is set | message-sending.int 2 |
| `dispatchedAt` not cleared on `SmsUnavailable` | message-sending.int 3, 4 (the retry is treated as in doubt) |
| `OutboxDefer` settle without `attempts: { decrement: 1 }` | outbox.int deferral case; message-sending.int 7 |
| `nextDelayMs` ignores `retryDelaysMs` | outbox.worker.test; outbox.int per-kind case; message-sending.int 3 (5 tries) |
| `deadLetter` hook called on a lost lease | outbox.int lost-lease case (hook count 2) |
| `nextSendingTime` returns `at` unchanged | sending.test; message-queue.int 2 |
| `smsNumber` accepts landlines | sending.test; message-queue.int 4 |
| `lockPatient` removed from `birthdayGreeting` | messages.int 3 (500s from the unique; still one row: proves the backstop) |
| `greetingYear` taken from the UTC year | messages.int 4 (Jan 1 00:30 Manila case) |
| `lastTried` returns `[]` | patients-read parity (some rows `noContact: true`) |
| `greetings` returns `[]` | today.int greeting case |
| log driver logs the number or body | log-sms.provider.test |
| Semaphore 500 classified as `SmsUnavailable` | semaphore-sms.provider.test 5 |

Equivalent mutants to expect green (and say so): the order of the three reads inside `queue`'s `Promise.all`; the
audit entry placed before vs after the queue call inside one transaction.

## Findings

(to fill)

## Not Verified

(to fill)

---
# Independent tester run (2026-10-17, branch feature/b9-messages)

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm run check` | PASS | exit 0 (shared 207, seed 22, web 358, api 345) |
| `pnpm --filter api test:int` | PASS | own DB pedia_dental_tester_b9_test: 39 files, 433 tests, exit 0 (/tmp/claude-0/b9t/int.log). A run on the shared test DB was contaminated by concurrent runs from other sessions |
| Live API behaviour (items 1-8) | PASS except D1/D2 | /tmp/claude-0/b9t/api.log, h.sh |

## Failures
- D1 (medium): GET /messages?patientId=a&patientId=b -> 500 (PrismaClientValidationError).
- D2 (low-medium): GET /messages?patientId=<192+ chars> -> 500 (Prisma P2000). Same class pre-exists on GET /patients/:id/appointments (B7).
