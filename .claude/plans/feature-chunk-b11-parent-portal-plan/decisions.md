# Decisions: B11 Parent portal and real parent accounts

Settled with the user on 2026-10-17. The architect plans against these and does not re-ask them.

1. **Who gets an account**: any guardian on a child (not only the primary) who has a mobile number, once the clinic invites them.
2. **How an invite starts**: staff click "Invite to portal" on the child's Overview; registering a patient sends nothing on its own.
3. **Invite channel**: SMS only, through the B9 queue (Semaphore, sender PRIMOLAR). No email provider in B11.
4. **Sign-in**: mobile number or email in the same box, plus a password.
5. **Invite link**: single use, valid 72 hours; a resend cancels the older link.
6. **Forgot password**: parents reset it themselves with an SMS link, valid 30 minutes, single use.
7. **Change password**: parents can change their password inside the portal (the demo allows staff only).
8. **Password rules**: the same as staff (B2).
9. **Several clinics**: one account per clinic, with the clinic chooser at sign-in (demo decision #27).
10. **Losing access**: a guardian removed from a child loses that child at once; the account stays while they have other children there.
11. **Suspended clinic**: its parents still sign in, read-only (as the demo).
12. **Sending hours**: invite and reset texts go out at any hour (a person just asked); the 8 AM to 8 PM rule stays for reminders.
13. **Demo parents**: seeded parents keep "pass123" in development and tests only.
14. **Shared contact**: one mobile number (or email) is one sign-in per clinic; a second guardian's invite with the same number is refused with a clear message. A shared email means that guardian signs in with their number.
15. **Number changed by staff**: the sign-in follows the new number, and the parent's sessions end.
16. **Who can invite**: front desk, Owner and admin (those who edit a family's contact details).
17. **Invite status**: the child's Overview shows each guardian's portal status (Not invited, Invited on ..., Active) with Resend.
18. **Turn off access**: staff can turn off one guardian's portal access without removing them; it signs them out, and they can be invited again.
19. **Reset privacy**: the reset screen never reveals whether an account exists; at most 3 reset texts per number per hour.
20. **Declined reminders**: an invite can still be sent when the family declined reminder texts (it is not a reminder).
21. **SMS counting**: invite and reset texts count in the clinic's SMS usage (limits per plan: B12).
22. **First sign-in**: after setting a password, the parent acknowledges the clinic's privacy notice before the portal opens (as the demo).

## Out of scope

- Email invitations and an email provider.
- Parents signing themselves up without an invite.
- Per-plan SMS limits (B12).

## Still open

- Semaphore account, credits and the PRIMOLAR approval: the user sets these up before go-live.
