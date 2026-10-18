# Decisions: B12 Operator console, sign-ups and subscriptions

Settled with the user on 2026-10-18. The architect plans against these and does not re-ask them.

1. **Storage per plan**: Small 2 GB, Mid 10 GB, Big 50 GB. At the limit new uploads are refused with a clear message; existing files stay.
2. **Texts per plan per month**: Small 300, Mid 1,000, Big 3,000, counted in billed SMS parts (as Semaphore bills).
3. **Text limit reached**: automatic reminders stop for the rest of the month; portal invites and password resets still go. The Owner is warned at 80% and told at 100%.
4. **Overdue**: a nightly job pauses a clinic 7 days after its due date (as the demo); paused staff can't sign in, parents read only.
5. **Primolar's payment QR**: one QR for all clinics, uploaded and replaceable by the operator in the console, with optional text under it (e.g. "GCash · Primolar · 0917…").
6. **Monthly payment**: in Settings → Plan the Owner sees the QR and the amount due, uploads a receipt screenshot (image, up to 5 MB) and types the reference number; the operator confirms the payment or rejects it with a reason the Owner sees.
7. **Sign-up payment**: the sign-up status page (by reference) shows the same QR and takes the receipt; the operator confirms it before approving.
8. **Receipts to check**: no email yet; the console shows a "Payments to check" count and list.
9. **Primolar invoice**: stays the browser-made PDF (an acknowledgment, not a BIR official receipt; BIR later).
10. **Operator login**: one operator login for now; two-step sign-in in B13.
11. **Price changes**: apply to new sign-ups at once, and to existing clinics from their next due date.
12. **Downgrades**: refused while the clinic has more branches or staff logins than the smaller plan allows.
13. **Cancelling**: by the operator on the clinic's request; access ends when the paid month runs out (as the demo).
14. **Fake sign-ups**: at most 5 sign-ups per hour from one address.
15. **Rejected sign-ups' files**: logo, reference images and receipt deleted 30 days after rejection; the record stays.
16. **What counts toward storage**: clinical photos, documents, patient photos and the clinic logo; not payment receipts.
17. **Usage shown**: storage used and texts this month against the plan's limits, to the Owner in Settings → Plan and to the operator per clinic.
18. **Text allowance month**: the calendar month, Manila time, not the billing month.
19. **Reminders over the limit**: logged as not sent ("monthly text limit reached") and never sent later.
20. **Extra allowance**: none in B12; the clinic upgrades instead.
21. **Rejected receipt**: the Owner (or the sign-up) can upload a new one.
22. **Partial payments**: none; the operator confirms only the full amount due, else rejects with the reason.
23. **No QR yet**: clinics see "Primolar will send you payment details" until the operator uploads one.
24. **Who sees receipts**: the clinic's Owner and the operator only.
25. **A paused clinic paying** (settled after planning): the Owner of a paused clinic can still sign in, but sees only Settings → Plan, to pay and upload a receipt; when the operator confirms the payment the clinic resumes. Other staff stay refused; parents read only (decision 4).
26. **Defaults accepted with 25**: while a downgrade waits, new branches and logins are checked against the smaller plan; at the text limit every automatic clinic text stops, never invites or resets; rejected monthly receipts are kept (decision 15 is sign-ups only); the QR image is at most 2 MB.

## Out of scope

- PayMongo checkout and auto-charging (own chunk after B13).
- BIR official receipts (later).
- Operator two-step sign-in, more operator logins (B13).
- Extra storage or text allowances bought separately.

## Still open

- Semaphore account and PRIMOLAR approval: the user, before go-live.
