# Primolar demo script (9 minutes)

A walk through the prototype for a clinic owner. It follows one clinic's day, shows what makes Primolar a product for
many clinics, how a new clinic joins and pays, and how children's records are handled under the Data Privacy Act. Every login uses the password **pass123**. All data is fake. It lives on Primolar's demo server and resets every night at 3:40 AM (Manila), so the next walk-through starts fresh.

**Before you start:** the demo is shared: changes you make are seen by anyone else signed in to it until the night's
reset. To start from a clean copy now, ask Primolar for a reset.

The demo has three clinics and one waiting to join:

- **Bulilit Smiles Pediatric Dental** (Mid plan): two branches, Imus and Dasmariñas, raspberry branding. Paid up.
- **Ngiti Kids Dental** (Small plan): one branch in Bacoor, blue branding, at its 5-login limit. Paid up, with its next
  payment due in about 2 days.
- **Ipin Kids Dental** (Small plan): Primolar's default look, a few days overdue and in its 7-day grace period.
- **Hagikgik Kids Dental**: signed up through the Get started form (Design it for me) and waiting for its setup fee.

| Login | Who |
| --- | --- |
| owner@gmail.com | Dr. Paolo Villanueva, Owner and dentist at Bulilit |
| admin@gmail.com | Carmen Dela Cruz, Admin and dentist, Imus only |
| dentist@gmail.com | Dr. Ana Reyes, a dentist at both clinics (shows the clinic chooser) |
| frontdesk@gmail.com | Liza Cruz, front desk, Imus |
| parent@gmail.com | A parent with two children at Bulilit, one mid-treatment (reads the clinic's privacy notice first) |
| owner@ngiti.demo | Dr. Bea Lim, Owner of Ngiti |
| owner@ipin.demo | Dr. Lara Santiago, Owner of Ipin (overdue) |
| operator@primolar.demo | Primolar's own console, at `/operator` |

---

## 1. The front desk's morning (1 min) · frontdesk@gmail.com

1. **Dashboard: Today at a glance.** Today's appointments, who is waiting, birthdays with a one-tap greeting, and
   booking requests from parents.
2. **Appointments.** Open the calendar, book a check-up for a child, and drag it to another time. The chair and the
   dentist can't be double-booked, and booking outside the branch's hours is refused.
3. **Billing → a patient's invoice → Record payment.** Open the receipt: it carries the clinic's logo and the Imus
   branch address. **Download PDF** produces the same letterhead.

*What to point out:* front desk runs appointments, billing, recalls and messages. They can read a child's chart but
can't write in it, and they don't see the finance dashboard.

## 2. The dentist in the chair (1 min) · dentist@gmail.com

1. Sign in: this dentist works at both clinics, so Primolar asks **Which clinic?** Choose Bulilit.
2. **Patients → any child.** The allergy banner stays at the top of every tab.
3. **Chart.** Record caries on a tooth and see it in the chart's history. **Notes**: write and sign a note; once signed
   it can't be edited, only corrected.
4. **Plan.** The treatment plan shows how far along the child is, item by item.

*What to point out:* the dentist can't take payments, see the finance dashboard or change Settings. Every patient
record they open is written to the audit trail.

## 3. The parent at home (45 s) · parent@gmail.com, on a phone

1. The first screen is Bulilit's **privacy notice**, with the consents on record for each child. **I've read this**
   opens the portal; it doesn't ask again until the clinic changes the notice. (If someone already read it today, the
   notice won't show again until the reset.)
2. Two children at the top: switch between them.
3. **Confirm** the next visit, **request** an appointment, see the **treatment plan** and the **bill**.
4. Show that the portal is in Bulilit's colours with Bulilit's logo, and a small "Powered by Primolar" at the bottom.
5. **Home → Privacy and consent:** the parent can switch clinical photos and reminder messages off (or on) themselves.

*What to point out:* a parent only ever sees their own children.

## 4. The Owner runs the clinic (1 min 15 s) · owner@gmail.com

1. **Dashboard → Showing: All branches.** The Owner switches between Imus, Dasmariñas and both together. Admin and
   front desk see only their own branch.
2. **Settings → Clinic → Look.** Type a light colour such as `#e07a48`: Primolar refuses it because white text on it
   can't be read, and offers a darker one. Click **Use #b04f18**, then **Save look**: the whole app recolours, light and
   dark.
3. **Settings → Staff.** The Owner adds and deactivates staff logins. A new login gets a temporary password shown
   once, and must choose its own at first sign-in.
4. **Settings → Plan.** "2 of 3 branches", "5 of 20 staff logins": what Bulilit's Mid plan allows.

## 5. A small clinic at its limit (20 s) · owner@ngiti.demo

1. Ngiti looks like its own product: blue, its own logo.
2. **Settings → Staff.** 5 of 5 logins: **Add staff** is off, with "Your Small plan includes 5 staff logins. Contact
   Primolar to upgrade." Deactivate someone and the seat frees up.

## 6. Primolar's console (40 s) · operator@primolar.demo at `/operator`

1. Every clinic on Primolar with its plan, Owner, and counts of branches, logins and patients, never a patient record.
2. **New clinic account**: for a clinic signing up by phone or in person. The same choices as the public form, plus the
   payment received. The Owner's temporary password shows once.
3. Open a clinic: change its **plan** (a downgrade disables nothing; it only stops new additions), **pause** it (its
   staff are signed out; parents keep read-only access), and **transfer ownership**.

## 7. A new clinic joins (1 min) · no sign-in, then operator@primolar.demo

1. On the sign-in page, click **Get started with Primolar**. Fill in a clinic, its first branch and Owner, pick a plan,
   and choose how it looks: **Use my own** (logo, one colour, a heading font), **Use the default look**, or **Design it
   for me**. The amount due shows the setup fee, the first month and the VAT inside it.
2. Send it without ticking **I'm authorised to act for this clinic and accept the Terms… and the Data Processing
   Agreement**: it's refused. Tick it and send. The thank-you page gives a reference (`PRM-…`) the clinic can use later to check where it stands. Try the
   same clinic name again: Primolar refuses it, ignoring case and spaces.
3. In the console, **Sign-ups** → your clinic → **Record payment** → **Approve and create clinic**. The Owner's
   temporary password shows once. Sign in with it: the clinic is already in the look it chose.
4. **Hagikgik** chose Design it for me: approve it, open its clinic page and use **Set branding** to deliver the
   finished logo, colour and font. **Price list** sets every plan's fees.

*What to point out:* a rejected sign-up shows its reason on the client's status page, and a paid sign-up's plan can't
be changed, so nobody is approved underpaid.

## 8. Monthly billing (1 min) · owner@ipin.demo, then the console

1. Sign in as Ipin's Owner: a banner says the payment is overdue and the date to pay by. **Settings → Plan** shows the
   next amount with VAT, every payment, and a PDF invoice for each.
2. Sign in as any other staff member, such as admin@gmail.com: no billing anywhere. Only the Owner sees it.
3. In the console, open **Ipin Kids Dental**: **Record payment** marks the month paid, and the due date stays on the
   same day of the month. Changing the plan: an upgrade starts at once, a downgrade on the next due date.

*To show the pause:* in the console, open **Ipin Kids Dental** and **Pause** it (section 6): Ipin's staff can't sign in,
parents keep read-only access, and **Reactivate** lifts it. (A clinic is also paused when a month stays unpaid past 7
days of grace, which a demo reset every night never reaches.)

## 9. Children's records and the Data Privacy Act (1 min) · frontdesk@gmail.com, then owner@gmail.com

1. **Patients → New patient.** Fill in the child and a guardian, then **Save patient**: before anything is saved, the
   **Parent's consent** step asks which guardian consented and records the clinic's notice version. Clinical photos and
   reminder messages are separate, optional, and start unticked.
2. Open **Calista Langworth**, whose header says **Consent not recorded** (registered before consent was required): care goes on, and
   **Record privacy consent** on the Overview's Privacy card fixes it. **Print consent form** gives the paper version.
3. **Coby Medhurst**'s family said no to photos: the dentist's **Add photo** for an intraoral photo is refused, X-rays still
   work. A family that said no to reminders gets no SMS or email, and anything already queued is withdrawn.
4. As the Owner, **Settings → Clinic → Privacy notice**: edit the notice and its privacy contact, **Save new version**.
   Parents read the new version at their next portal visit.
5. The **Privacy** and **Terms** links at the bottom of sign-in open Primolar's Terms, Data Processing Agreement and
   Privacy Policy, each marked **Template, pending legal review**. A new staff login reads "Patient records are
   confidential; every access is logged" once at first sign-in, and the console shows each clinic's signed agreement
   and how many patients have no consent recorded, never their names.

*Close with:* one product, many clinics, each with its own brand, branches, staff and monthly plan, and Primolar
running them all without ever seeing a child's record.

---

## If something goes wrong

- **Data looks odd after earlier clicks:** changes made earlier today are still there; the demo resets every night, or
  ask Primolar for a reset.
- Everyone shares one copy of the demo.
