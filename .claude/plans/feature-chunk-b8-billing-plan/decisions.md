# Decisions: Chunk B8, billing, payments and the financial dashboard

Settled with the user on 2026-10-17. The architect plans against these and does not re-ask them.

1. **Receipt numbers**: one sequence per clinic (AR- for money received, CR- for deposit credit), never repeating or skipping. Acknowledgment receipts, not BIR official receipts.
2. **A bill made by mistake**: voided with a required reason, never deleted; it stays on record, counts in no balance or total, and its treatments can be billed again.
3. **Who may void**: the Owner and admins only (same as refunds), so cash can't be taken and its bill voided.
4. **When a void is allowed**: only while no payment row ever touched the bill; a paid-then-fully-refunded bill can't be voided.
5. **Refunds**: the Owner and admins only; front desk records payments, deposits and deposit credit (moving credit isn't a refund).
6. **Payment dates**: always "now"; no back-dating.
7. **Parents and voided bills**: hidden from parents; staff see them marked Voided.
8. **An appointment billed in two bills**: judged by its first bill, as the demo; changed later everywhere at once.
9. **Privacy log**: whole-day money screens (the daily collections, the dashboard) aren't logged, as B7's decision 6; each child's bills and payments are.

## Out of scope

- A payment gateway (PayMongo); clinics pay Primolar by manual QR, built in B12.
- Receipts and statements as documents on the API (B10).

## Still open

- None.
