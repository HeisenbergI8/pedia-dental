# Decisions: B9 — parent messages and real sending

Settled with the user on 2026-10-17. The architect plans against these and does not re-ask them.

1. **Channel**: SMS only, through Semaphore. Email is out of B9. Dev and tests use a log-only driver.
2. **Who pays**: one platform-owned Semaphore account; each plan will include a monthly number of texts (numbers set in B12).
3. **Sender name**: one shared sender name (e.g. "PRIMOLAR") for every clinic; the clinic's name goes in the message body. Per-clinic sender names later.
4. **Quiet hours**: texts go out only 8am–8pm Asia/Manila; anything due outside that waits until 8am.
5. **Failures**: retry 3 times (about 1 min, 5 min, 30 min), then status `failed` with the reason, shown in `/messages`. No Resend button in B9.
6. **Recipient**: the primary guardian's phone only (as the demo does).
7. **Cancelled appointment**: its unsent messages are withdrawn (`cancelled`). **Moved appointment**: the old reminder is withdrawn and a new one queued for the new time.
8. **Birthday greetings**: automatic daily job each morning, at most once per child per calendar year; the manual button stays.
9. **Recall / due-item texts**: stay manual (staff click the button); no automatic due-item job.
10. **SMS usage**: count texts sent per clinic per month; never block in B9. The limit and what happens at it come in B12.
11. **Real sending switch**: the log driver is used everywhere, production included, until a Semaphore API key is configured.
12. **No usable phone**: the message fails at once as "no phone number", with no retries.

## Out of scope

- Email sending and any email provider.
- Per-clinic sender names; clinics bringing their own Semaphore account.
- A Resend button for failed texts.
- Automatic recall / due-item texts.
- Enforcing a monthly SMS limit (B12).

## Still open

- SMS allowance per plan tier: decided in B12 (user).

## Settled after planning (2026-10-17, plan Follow Ups 1–4 and 6)

13. **In-doubt send**: a text whose outcome is unknown (crash or timeout mid-send) shows as failed, "Not confirmed by the SMS provider", and is never resent.
14. **Monthly count**: keep both texts and billed parts; B12 decides which one the plan limit uses.
15. **Phone in the log**: stays visible to dentists in B9 (as the demo); masked later in shared, mock and API together.
16. **Suspended clinics**: no automatic birthday texts; texts already queued still go.
17. **Moved appointment**: also sends a new confirmation with the new time (as the demo).
18. **Sender name**: not yet settled. The user didn't accept "PRIMOLAR". It stays a setting (`SMS_SENDER_NAME`), needed only before real sending.
