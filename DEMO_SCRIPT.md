# Primolar demo script (5 minutes)

A walk through the prototype for a clinic owner. It follows one clinic's day, then shows what makes Primolar a
product for many clinics. Every login uses the password **pass123**. All data is fake and lives in your browser.

**Before you start:** open the link in a normal (not private) browser window. If an earlier walk-through left changes
behind, sign in as anyone, open the account menu and choose **Reset demo data**.

The demo has two clinics:

- **Bulilit Smiles Pediatric Dental** (Mid plan): two branches, Imus and Dasmariñas, raspberry branding.
- **Ngiti Kids Dental** (Small plan): one branch in Bacoor, blue branding, at its 5-login limit.

| Login | Who |
| --- | --- |
| owner@gmail.com | Dr. Paolo Villanueva, Owner and dentist at Bulilit |
| admin@gmail.com | Carmen Dela Cruz, Admin and dentist, Imus only |
| dentist@gmail.com | Dr. Ana Reyes, a dentist at both clinics (shows the clinic chooser) |
| frontdesk@gmail.com | Liza Cruz, front desk, Imus |
| parent@gmail.com | A parent with two children at Bulilit, one mid-treatment |
| owner@ngiti.demo | Dr. Bea Lim, Owner of Ngiti |
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

1. Two children at the top: switch between them.
2. **Confirm** the next visit, **request** an appointment, see the **treatment plan** and the **bill**.
3. Show that the portal is in Bulilit's colours with Bulilit's logo, and a small "Powered by Primolar" at the bottom.

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
2. **New clinic account**: create a clinic with its first branch and Owner. The Owner's temporary password shows once.
3. Open a clinic: change its **plan** (a downgrade disables nothing; it only stops new additions), **pause** it (its
   staff are signed out; parents keep read-only access), and **transfer ownership**.

*Close with:* one product, many clinics, each with its own brand, branches and staff, and Primolar running them all
without ever seeing a child's record.

---

## If something goes wrong

- **"This browser can't run the demo":** the browser blocked the demo's storage (private windows, some work
  laptops). Use a normal window of Chrome, Edge, Safari or Firefox.
- **Data looks odd after earlier clicks:** account menu → **Reset demo data**.
- Each visitor has their own copy of the demo data. Nothing you do is seen by anyone else.
