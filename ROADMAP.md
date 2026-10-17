# Roadmap: Primolar (frontend prototype)

Primolar is clinic management for pediatric dental clinics, sold as a service: each paying clinic is a
**clinic account** with its own branches, staff, patients and branding (feature 16), which signs up and pays
through feature 17 and handles children's records under the Data Privacy Act (feature 18). Features 1–15 work
inside one clinic account.

Two parts:

1. **Features**: what each of the 18 features does, its screens, its data, and its rules.
2. **Build chunks**: the order to build them in. Each chunk depends only on chunks above it and ends
   with a "done when" you can check. Chunks 0–18 were sized for one or two sessions. From chunk 19 on,
   each chunk is one **Large** piece of work with its own architect plan: fewer, bigger chunks.

Scope for every chunk is the **prototype**: real UI, fake data through MSW, no backend. Anything marked
*Later* belongs to the NestJS phase. Follow `CONVENTIONS.md` → "Registering a new feature" for each one.

---

# Part 1: Features

## 1. Patient profiles

The child's master record. Every other feature hangs off it.

- **Fields:** child's name, date of birth, age (computed, shown in years and months), sex, address;
  one or more guardians with relationship, phone, email and a primary flag; emergency contact;
  allergies, medical conditions, medications; previous dental history (free text plus prior clinic);
  consent records (what was consented to, by which guardian, when); important notes and alerts.
- **Screens:** patient list with search; create and edit form; patient record page with tabs.
- **Rules:** allergies and alerts appear as a banner on every patient screen and can't be collapsed.
  At least one guardian is required. Age is computed from date of birth, never stored.
- **Later:** duplicate detection (same name and birth date), merge patients.

## 2. Pediatric dental chart

The core of the app and the hardest piece. A visual tooth chart matching the clinic's Oral Examination
Chart (FDI numbering).

- **Teeth:** permanent 11–18, 21–28, 31–38, 41–48; primary 51–55, 61–65, 71–75, 81–85.
- **Dentition modes:** primary, permanent, or mixed. Mixed shows both rows, like the paper chart.
- **Per tooth:** condition per surface (M, O or I, D, B, L) or for the whole tooth: sound, caries,
  restored, sealant, fluoride, pulpotomy, pulpectomy, extracted, missing, unerupted, erupting.
  Each tooth has its own notes and a history list.
- **Screens:** chart view inside the patient record; a tooth panel that opens on click to record a
  finding; a history view for each tooth; a "chart as of visit X" selector.
- **Rules:** entries are append-only. A correction is a new entry that supersedes the old one, and the
  current chart is derived with `deriveChart()`. Colors must also differ in lightness or pattern, not
  hue alone.

## 3. Clinical notes

Template-driven notes for common pediatric procedures: oral examination, prophylaxis, fluoride
application, sealants, restoration, pulpotomy, pulpectomy, extraction, space maintainer, orthodontic
assessment, emergency visit.

- **Oral examination template** mirrors the paper chart: oral hygiene (good, fair, poor), gingivitis
  and plaque (mild, moderate, severe), caries risk assessment (low, mid, high), changes in health
  since the last appointment, current medications, and checkboxes for facial asymmetry,
  lymphadenitis or lymphadenopathy, and trismus, plus others.
- **Screens:** "New note" picks a template and opens a form generated from the template's fields.
  Notes are listed per visit. A signed note is read-only.
- **Rules:** templates are data (`NoteTemplate`), so adding one needs no code. A note's procedure
  feeds follow-up rules (feature 15) and treatment progress (feature 11).

## 4. Appointment management

- **Views:** day view with one column per chair, week view, month view.
- **Actions:** new appointment, reschedule (drag or edit), cancel with a reason, mark no-show.
- **Fields:** patient, dentist, chair or room, start time, duration (defaults from the procedure),
  reason, status.
- **Status flow:** booked → confirmed → arrived → in chair → done, or no-show or cancelled.
- **Rules:** no double-booking a chair or a dentist. The no-show count shows on the patient profile.
  Follow-up appointments link back to the rule that created them.
- **Later:** real automatic reminders (sending lives in feature 5).

## 5. Automated parent messages

Reusable message templates with placeholders such as `{child_first_name}`, `{date}` and `{time}`:
appointment confirmation, appointment reminder, post-extraction instructions, post-pulpotomy
instructions, fluoride instructions, pre-treatment instructions, missed appointment, follow-up
reminder, recall or 6-month checkup, birthday greeting.

- **Screens:** template list and editor with live preview; a message log of queued, sent and failed
  messages.
- **Rules:** events create queued messages. Booking creates a confirmation and a reminder, a no-show
  creates a missed-appointment message, a signed extraction note creates post-op instructions.
- **Prototype:** messages are queued and shown in the log, never sent.
- **Later:** an SMS provider (Semaphore) and email through the NestJS outbox.

## 6. Parent portal

Optional and built last. Parents can view and confirm appointments, request an appointment, view
treatment plans and invoices, read care instructions, and upload medical documents or photos.

- **Rules:** a parent sees only their own children. The portal uses the same API, not a separate copy.
- **Prototype:** a demo login with parent accounts tied to seeded guardians; ownership enforced by the mock API (403).
- **Later:** real parent accounts and invitations.

## 7. Billing and payments

- **Data:** treatment fees from a procedure catalog, discounts, deposits, partial payments, balance,
  payment history, payment method (cash, GCash, Maya, card, bank transfer), receipt or reference
  number.
- **Per patient:** the summary from the spec, for example total ₱8,500, paid ₱5,000, balance ₱3,500.
- **Screens:** an invoice built from completed treatment items; record a payment; patient statement;
  daily collection list.
- **Rules:** all money is integer centavos. Payments are append-only, and a refund is a negative
  payment. Balances are computed from payments, never stored.
- **Later:** BIR-compliant official receipts. The prototype issues acknowledgment receipts only.

## 8. Financial dashboard

Today's, this week's and this month's collection; outstanding balances; unpaid appointments; revenue
by procedure; payment method breakdown. Admin only. Every number is computed from invoices and
payments, with no separate totals stored.

## 9. Child behavior tracking

Recorded on each visit: cooperative, anxious, fearful, crying, resistant, needs parental presence,
requires behavior guidance. Multi-select, plus a short note. A trend strip on the patient record shows
the last several visits, so the dentist can prepare before the child is seated.

## 10. Growth and development

Age, dentition stage, eruption status (from the chart), oral habits: thumb sucking, pacifier use,
mouth breathing, bruxism, speech-related observations. Recorded on each visit with a timeline on the
patient record. Habits record a start date and when they stopped.

## 11. Treatment progress

A treatment plan is a list of planned items, for example: cleaning, fluoride, tooth 51 restoration,
tooth 74 restoration, tooth 84 restoration, follow-up.

- **Each item:** procedure, tooth (optional), fee, status (planned, in progress, done, declined),
  and the visit it was completed in.
- **Screens:** the plan with checkboxes and a progress bar; "add to plan" from a chart finding.
- **Rules:** completing an item happens through a clinical note, not a bare checkbox. Done items feed
  billing (feature 7).

## 12. Clinical photos

Intraoral photos, extraoral photos, before and after, X-rays, referral documents, taken or uploaded
from the patient profile. Organized as patient → visit → date → type, with a before ↔ after
comparison slider.

- **Prototype:** files stay in the browser (object URLs or compressed data in IndexedDB).
- **Later (done in B10):** Amazon S3 (R2 by config); uploads stream through the API, reads are 5-minute private links.

## 13. Document generation

Automatically created from existing data: dental certificate, treatment plan, consent forms, referral
letters, medical or dental clearance, post-operative instructions, prescriptions, receipts, patient
summaries.

- **Screens:** pick a document type, preview it, download the PDF (`@react-pdf/renderer`).
- **Rules:** documents fill from data and never ask staff to retype it. Each generated document is
  logged on the patient record. Prescriptions exclude controlled (S2) drugs.

## 14. Recall system

3-month and 6-month recalls. A "due" list shows overdue, due this week and due this month, with
one-tap booking and a recall message.

## 15. Treatment follow-up

Procedure-based follow-ups: extraction → 7 days, pulpotomy → 2 weeks, sealant → recall in 6 months.
When a note for that procedure is signed, a follow-up becomes due on the computed date. The rules are
editable data (`DEFAULT_FOLLOW_UP_RULES`). Shares the "due" list with feature 14.

## 16. Primolar platform (clinic accounts, tiers, branches, branding)

Turns the single-clinic app into a product many clinics use. Decisions settled on 2026-10-12 live in
`.claude/plans/feature-primolar-platform-plan/decisions.md`; this section is the summary.

- **Who's who:** the **Primolar operator** (you) runs the product. A **clinic account** is one paying
  dental business. It has exactly one **Owner**, one or more **branches** (physical locations), and
  **staff** (Admin, Dentist, Front desk), each assigned to one or more branches. Parents use the portal
  and are never staff. Any staff role, the Owner included, can also hold a clinical role.
- **Tiers:**

  | | Small | Mid | Big |
  |---|---|---|---|
  | Branches | 1 | up to 3 | unlimited |
  | Staff logins (the Owner counts) | 5 | 20 | unlimited |
  | Cross-branch dashboard and finance | — | ✓ | ✓ |
  | Logo, brand colour and heading font | ✓ | ✓ | ✓ |

- **What belongs where:** the clinic account owns patients and charts, the procedure price list,
  message templates and recalls (filterable by branch), plus its name, logo, contact email and TIN.
  A branch owns its address, phone, opening hours, chairs, appointments, and the invoices and payments
  for visits there. Documents and receipts show the clinic's name and the visit branch's address.
- **Screens:**
  - *Operator console:* clinic accounts with tier, Owner and usage (branches, staff, patients);
    create an account and invite its Owner; change tier; suspend and reactivate; transfer ownership.
  - *Owner settings:* clinic profile; branches (add, edit, archive); staff (add with role and branches,
    deactivate); branding (logo, brand colour, heading font); the account's tier and usage.
  - *Branch switcher* in the top bar for staff at several branches, with "All branches" for the Owner.
  - *Clinic chooser* after sign-in when an email belongs to more than one clinic account.
- **Rules:**
  - Every record belongs to one clinic account, and branch-level records to one branch. No account
    ever sees another account's data. The operator never sees patient records.
  - Reaching a tier limit blocks the next branch or staff login with "Contact Primolar to upgrade".
    A downgrade never disables what exists; nothing new is added until the account is under the limit.
  - Branches are archived, never deleted. Staff are deactivated, never deleted; their name stays on
    what they recorded. Neither counts toward limits once archived or deactivated.
  - A new staff login gets a temporary password, shown once, changed at first sign-in.
  - The shared-device PIN switch lists only staff assigned to that device's branch.
  - A suspended account's staff can't sign in, and anyone signed in is signed out; sign-in says
    "Contact your clinic". Parents keep read-only portal access to their child's records (Data Privacy
    Act). All data is kept and returns on reactivation.
  - A payment belongs to the branch where the visit happened. Parent appointment requests stay
    account-wide; front desk picks the branch when booking.
- **Branding:** a logo (PNG, JPG or SVG, up to 1 MB) and one brand colour on every tier. The app derives
  the colour's tints, shades and dark-mode version and refuses a colour that fails WCAG AA contrast,
  suggesting the nearest that passes. A heading font from a shortlist of six rounded fonts, on every plan
  since feature 17 (it was Big-only); it applies to headings and the clinic name only. The clinic's logo replaces Primolar's everywhere staff
  and parents look (sidebar, portal, receipts, letterheads, PDFs); with no logo, the clinic name shows in
  its heading font. Primolar's wordmark stays on the sign-in page, the operator console, and a small
  "Powered by Primolar" line.
- **Later:** per-clinic web addresses; real email invites; per-branch price lists; operator impersonation for
  support. Sign-up and payments moved to feature 17.

## 17. Onboarding and billing (sign-up form, setup fee, monthly subscription)

How a new clinic signs up and pays. Decisions settled on 2026-10-13 live in
`.claude/plans/feature-primolar-billing-plan/decisions.md`; they replace feature 16's "the operator types the
account in", "no payments" and "font on Big only".

- **The flow:** the client fills in a public **Get started** form → sees the amount due → pays the setup fee and
  first month → Primolar reviews (fix or reject with a reason) and approves → the clinic is created already
  branded, and its Owner signs in with a temporary password. Primolar can still create a clinic directly in the
  console for sign-ups by phone or in person.
- **The form:** clinic name, contact email, TIN; the first branch's name, address, phone and hours; the Owner's
  name, email and whether they are a dentist; the plan; and one of three **branding choices**:
  - *Use my own:* logo, one brand colour (contrast-checked) and a heading font from the shortlist.
  - *Use the default look:* no logo (the clinic's name shows), Primolar's colours; changeable later in Settings.
  - *Design it for me:* Primolar designs the logo, colour and font from a short brief and up to 3 reference
    images, for a fixed extra fee. The clinic goes live with the default look; Primolar applies the finished
    branding from the console ("Design in progress" → "Delivered").
- **Prices:** Philippine pesos, VAT-inclusive. A setup fee and a monthly fee per plan, plus one design add-on, in a
  price list the operator edits. Paid upfront: setup + first month (+ design). Monthly only: no annual billing,
  trial or promo codes.
- **Subscription rules:** due monthly on the approval date (the last day of shorter months). Upgrades apply at
  once, downgrades on the next due date, no part-month charges. A missed payment gets 7 days' grace with a banner
  for the Owner, then the clinic is paused (staff out, parents read-only, nothing deleted). A late payment
  recorded by the operator reactivates it, and due dates stay on schedule. Cancelling goes through Primolar; data
  is kept.
- **Screens:**
  - *Get started* (public): the form, then a thank-you page with the amount due.
  - *Operator console:* sign-ups (waiting for payment, approved, rejected); record a payment; approve, fix or
    reject; the price list; each clinic's subscription, due date and payment history; "Set branding" for
    designed brands.
  - *Owner:* Settings → Plan gains the next due date and amount, payment history and invoices; an overdue
    banner during the grace period. Other staff see no billing.
- **Paying by QR (decided 2026-10-17):** until there are paying clinics, sign-up and monthly fees are paid to
  Primolar's QR (GCash, Maya or bank), which the operator uploads and can replace. The thank-you page and the Owner's
  Settings → Plan show it with the amount due; the clinic uploads the receipt screenshot and the reference number, and
  the operator checks it and records the payment by hand. Built with the backend's subscriptions (B12).
- **Later:** PayMongo checkout (cards, GCash, Maya), automatic monthly charging, emails and BIR official receipts, in
  their own chunk once clinics are paying.

---

## 18. Privacy and consent (Data Privacy Act, RA 10173)

What the app shows and records so a pilot clinic can put real children's records in. Children's health records are
sensitive personal information: the **clinic** is the personal information controller, **Primolar** the processor
that handles the data for it, and **parents** the data subjects. Decisions are settled in
`.claude/plans/feature-primolar-privacy-plan/decisions.md` (25 decisions, settled 2026-10-13).

- **Two agreements, two places:**
  - *Primolar ↔ clinic:* Terms of Service and a Data Processing Agreement, accepted with an unticked checkbox on the
    Get started form (or marked "signed, on file" by the operator for a phone sign-up).
  - *Clinic ↔ parent:* the clinic's privacy notice and the parent's consent, recorded when the front desk registers
    a child, and acknowledged by the parent the first time they open the portal.
- **Proof, not just a checkbox:** who accepted what, when, and which version. A new version asks again.
- **The clinic's privacy notice:** started from a Primolar template, edited by the Owner in Settings, shown in the
  parent portal.
- **Links everywhere a stranger lands:** "Privacy" and "Terms" on sign-in, Get started and the portal.
- **Documents:** templated for the pilot (Terms of Service, Data Processing Agreement, Primolar Privacy Policy,
  clinic privacy notice, parent consent form). A lawyer reviews them before Primolar grows past the pilot.
- **Demo:** in Bulilit, one child has no consent recorded (the flag) and one declined clinical photos (the block); the
  parent demo login reads the clinic's notice before the portal opens.
- **Prototype vs backend:** the prototype shows and records everything on MSW data. Encryption at rest, backups,
  real sessions, data export and deletion requests, and NPC registration belong to the backend phase.

---

# Part 2: Build chunks (in build order: 18 comes last)

Total ≈ 268 hours (153 for features 1–15, 59 for the platform, 40 for onboarding and billing, 16 for privacy and consent). Hours are estimates for one developer using Claude Code.

## ✅ Chunk 0: Foundation (done)

Workspace, shared schemas and domain logic, MSW mock layer, app shell with role switcher, patient
list, patient header, provenly. Tests green.

## ✅ Chunk 1: UI kit (6 h) (done)

**Goal:** stop hand-styling every input before the forms pile up.

- Add shadcn/ui: button, input, label, select, textarea, checkbox, dialog, sheet, tabs, toast, badge,
  dropdown-menu.
- Build one `FormField` wrapper for React Hook Form + Zod (label, input, error message).
- Add a "Reset demo data" button to the shell.

**Done when:** a sample form uses only kit components, and errors show under each field.

## ✅ Chunk 2: Clinic setup data (6 h) (done)

**Goal:** the reference data that appointments, plans and billing all need.

- Schemas and seed data: dentists and staff, chairs, procedure catalog (code, name, default
  duration, fee in centavos, follow-up rule).
- A read-only Settings page that lists them (editing comes later if needed).

**Done when:** the procedure catalog loads through MSW and is validated by the shared schema.

**Depends on:** 1.

## ✅ Chunk 3: Patient profile complete (10 h) — feature 1 (done)

- Create and edit forms: guardians (add or remove, mark primary), emergency contact, allergies,
  conditions, medications, dental history, alerts.
- Consent records: add a record with guardian, scope and date.
- Patient record page with tabs: Overview, Chart, Notes, Plan, Photos, Billing, Documents (empty
  tabs are fine).

**Done when:** you can create a patient, refresh, and still see them; the alert banner shows on
every tab.

**Depends on:** 1.

## ✅ Chunk 4: Visits (6 h) (done)

**Goal:** the backbone. Chart entries, notes, behavior, photos and payments all attach to a visit.

- `Visit` schema (patient, date, dentist, appointment link, status) plus mocks.
- "Start visit" on the patient record; a visit list on the Overview tab.

**Done when:** a patient has visits, and the current visit is clear in the UI.

**Depends on:** 3.

## ✅ Chunk 5: Dental chart, display (12 h) — feature 2, part 1 (done)

- An SVG tooth component with 5 clickable surface zones (incisal edge for front teeth).
- Full chart layout that matches the paper chart: quadrants, primary row, primary / permanent /
  mixed toggle.
- Renders conditions from `deriveChart()` with a legend; colors also use pattern or lightness.

**Done when:** seeded chart entries show correctly in all three modes, keyboard-focusable.

**Depends on:** 4.

## ✅ Chunk 6: Dental chart, editing and history (12 h) — feature 2, part 2 (done)

- Tooth panel: pick surfaces and a condition, add a note, save as a chart entry for the current visit.
- Correct a finding (a superseding entry), never edit in place.
- Per-tooth history list; "chart as of visit" selector.

**Done when:** you can record caries on 74-O, restore it in a later visit, and see both in history.

**Depends on:** 5.

## ✅ Chunk 7: Clinical notes + behavior tracking (12 h) — features 3 and 9 (done)

- A template renderer that builds a form from `NoteTemplate.fields`.
- Seed all 11 templates. The oral exam template matches the paper chart.
- Behavior multi-select inside each note; trend strip on the patient Overview.
- Sign a note to lock it.

**Done when:** signing a pulpotomy note works and the note becomes read-only.

**Depends on:** 4. Use chunk 6's tooth picker for the "teeth" field type.

## ✅ Chunk 8: Growth and development (4 h) — feature 10 (done)

- A per-visit record: habits with started and stopped dates, speech observations.
- Dentition stage and eruption status read from the chart.
- A timeline on the Overview tab.

**Done when:** a habit recorded in one visit and marked stopped in a later one shows correctly on
the timeline.

**Depends on:** 6.

## ✅ Chunk 9: Treatment plan and progress (10 h) — feature 11 (done)

- Plan items from the procedure catalog, optionally tied to a tooth, with a fee.
- "Add to plan" from a chart finding.
- Items complete when a matching note is signed; progress bar.

**Done when:** the spec's example plan (cleaning, fluoride, 51, 74, 84, follow-up) shows 3 of 6 done.

**Depends on:** 2, 6, 7.

## ✅ Chunk 10: Appointments (14 h) — feature 4 (done)

- Day view by chair (react-big-calendar resources), plus week and month views.
- Create, reschedule, cancel; the status flow; no-show tracking on the profile.
- Double-booking checks in the mock handler (so the backend copies the rule).
- "Start visit" from an arrived appointment.

**Done when:** you can book, move, check in, and finish an appointment, and a no-show counts on the
patient.

**Depends on:** 2, 4.

## ✅ Chunk 11: Follow-ups and recalls (8 h) — features 14 and 15 (done)

- Signing a note whose procedure has a rule creates a due item (`dueDateFor`).
- A "Recalls" page with overdue, this week and this month lists, and one-tap booking.

**Done when:** an extraction signed today shows as due in 7 days, and booking it removes it from
the list.

**Depends on:** 7, 10.

## ✅ Chunk 12: Billing and payments (12 h) — feature 7 (done)

- Create an invoice from done plan items, with a discount.
- Record payments (method, reference number), partial payments, and refunds as negative payments.
- Patient statement and a printable acknowledgment receipt.

**Done when:** the ₱8,500 / ₱5,000 / ₱3,500 example reproduces exactly, using `invoiceBalance`.

**Depends on:** 9.

## ✅ Chunk 13: Financial dashboard (5 h) — feature 8 (done)

- Recharts: collections by day, week and month; revenue by procedure; method breakdown.
- Outstanding balances and unpaid appointments tables.
- Admin only.

**Done when:** dashboard totals match the sum of seeded payments.

**Depends on:** 10, 12.

## ✅ Chunk 14: Parent messages (8 h) — feature 5 (done)

- Template editor with placeholders and live preview.
- An event → queued message hook for booking, reminders, no-shows, post-op notes, recalls and
  birthdays.
- A message log page.

**Done when:** booking an appointment queues a confirmation and a reminder with the child's name
filled in.

**Depends on:** 10, 11.

## ✅ Chunk 15: Clinical photos (6 h) — feature 12 (done)

- Upload or take a photo (`<input capture>`), compress in the browser, store in IndexedDB.
- Gallery by visit and type; before ↔ after slider.

**Done when:** before and after photos of one tooth compare side by side after a refresh.

**Depends on:** 4.

## ✅ Chunk 16: Document generation (8 h) — feature 13 (done)

- PDF templates for all 9 document types, filled from patient, chart, plan and billing data.
- Preview, download, and a log on the patient record.

**Done when:** a dental certificate and a receipt download with correct data and no retyping.

**Depends on:** 9, 12.

## ✅ Chunk 17: Parent portal (8 h) — feature 6 (done, with demo login and role-based access)

- A `(portal)` layout with "view as parent" demo login.
- Appointments (view, confirm, request), treatment plan, invoices, instructions, uploads.
- Ownership enforced in the mock handlers: a parent gets only their own children.

**Done when:** a parent sees one child's data and gets 403 for another child's.

**Depends on:** 10, 11, 12, 14, 15.

## ✅ Chunk 19: Tenancy foundation (22 h) — feature 16, part 1 · Large (done)

**Plan:** `.claude/plans/feature-primolar-tenancy-plan/`
**Status:** built 2026-10-12

**Goal:** every record knows its clinic account and, where it applies, its branch; staff sign in to
the right clinic and work at the right branch.

- Shared schemas for clinic account (name, logo, contact email, TIN, tier, status) and branch (name,
  address, phone, opening hours, archived). Tier limits as data, not `if` statements.
- The mock store split into one dataset per clinic account, so a handler can only reach its own
  account's data. Branch ids on appointments, chairs, invoices and payments.
- `CLINIC_NAME` and `CLINIC_HOURS` come from the account and branch instead of constants.
- Seed: Bulilit Smiles Pediatric Dental (two branches) and Ngiti Kids Dental (Small tier).
- Owner role above Admin; any staff role can add a clinical role; staff carry assigned branches.
- One sign-in page that finds the account by email, with a clinic chooser; suspended accounts refused
  (staff signed out, parents read-only).
- Branch switcher; the PIN switch lists only the device's branch staff.

**Done when:** signed in to either demo account, no screen or API call returns the other's data
(tested); a staff member at two branches switches between them and sees each branch's day; a
suspended account's staff are refused at sign-in.

**Depends on:** 17.

## ✅ Chunk 20: Owner settings and clinic branding (24 h) — feature 16, part 2 · Large (done)

**Plan:** `.claude/plans/feature-primolar-branding-plan/`
**Status:** built 2026-10-12

- Owner settings: clinic profile; branches (add, edit, archive, never the last one); staff (add with
  role and branches, temporary password, deactivate); tier and usage panel.
- Tier limits enforced in the UI and the mock handlers, with "Contact Primolar to upgrade".
- Branding: logo upload (stored like clinical photos); one brand colour with derived tints, shades and
  dark values, checked against WCAG AA; heading font shortlist on Big. Applied at runtime through the
  existing CSS tokens everywhere the Primolar logo is today, PDFs included, plus "Powered by Primolar".

**Done when:** on the Small demo account, adding a second branch or a sixth staff login is refused with
the limit shown, and archiving or deactivating frees the slot; each demo account shows its own logo
and colour in the staff app, portal, a receipt and a PDF, in light and dark; a low-contrast colour is
refused with a suggestion.

**Depends on:** 19.

## ✅ Chunk 21: Cross-branch views and operator console (13 h) — feature 16, part 3 · Large (done)

**Plan:** `.claude/plans/feature-primolar-operator-plan/`
**Status:** built 2026-10-13

- Branch filter on the dashboard and finance views, plus an "All branches" total for the Owner. Mid
  and Big only.
- A separate operator sign-in and console: accounts with tier, Owner and usage counts; create an
  account and its Owner; change tier; suspend and reactivate; transfer ownership. No patient data.

**Done when:** the Owner of a two-branch account sees each branch and the combined total, and a Small
account doesn't see the filter; the operator creates a third account, signs in as its new Owner, and
downgrading it to Small blocks new additions without disabling anything.

**Depends on:** 20, 13.

## ✅ Chunk 22: Sign-ups, branding choices and approval (22 h) — feature 17, part 1 · Large (done)

**Plan:** `.claude/plans/feature-primolar-billing-plan/`
**Status:** built 2026-10-13

- A public **Get started** form: clinic, first branch, Owner, plan and the three branding choices (own logo,
  colour and font; the default look; Design it for me with a brief and reference images). Duplicate clinic names
  and contact emails refused. A thank-you page with the amount due.
- The heading font on every plan (replaces Big-only).
- The operator console's **Sign-ups**: waiting for payment, approved, rejected. Record the upfront payment by
  hand; fix a sign-up; reject with a reason (refunded outside the app); approve to create the clinic already
  branded, with its first branch and an Owner on a temporary password.
- **Price list** in the console: a setup fee and monthly fee per plan and the design add-on, VAT-inclusive pesos.
- **Set branding** in the console for *Design it for me* clinics, with the design status.
- Demo data: one sign-up waiting for its setup fee.

**Done when:** a client submits the form with each branding choice; the operator records the payment and
approves; the new Owner signs in to a clinic already in their logo, colour and font (or the default look); a
duplicate name is refused; a rejected sign-up shows its reason; and a *Design it for me* clinic gets its
finished branding from the console.

**Depends on:** 21.

## ✅ Chunk 23: Subscriptions, payments and the overdue pause (18 h) — feature 17, part 2 · Large (done)

**Plan:** `.claude/plans/feature-primolar-subscriptions-plan/`
**Status:** built 2026-10-13

- A subscription per clinic: plan, monthly price, due date (the approval date; the last day of shorter months).
- The operator records monthly payments by hand; each payment gets a Primolar invoice (VAT shown).
- Plan changes: upgrade at once, downgrade on the next due date, no part-month charges.
- Missed payment: 7 days' grace with an overdue banner for the Owner, then the existing pause; a recorded late
  payment reactivates it on the original schedule. Cancellation by Primolar pauses the clinic at the end of the
  paid month.
- The Owner's **Settings → Plan**: next due date and amount, payment history, downloadable invoices; reminders in
  the app ("due in 3 days", "overdue"). Other staff see no billing.
- The console's clinic page: subscription status, due date, payment history.
- Demo data: Bulilit and Ngiti paid up; one clinic in its grace period.
- Demo: Ipin Kids Dental (owner@ipin.demo) is the clinic in its grace period.

**Done when:** a clinic approved on the 31st is due on the 30th next month; a missed payment shows the Owner a
banner for 7 days and then pauses the clinic; recording the payment reactivates it with the due date unchanged;
an upgrade raises the next invoice and a downgrade waits for the due date; only the Owner sees any billing.

**Depends on:** 22.

## ✅ Chunk 24: Privacy, terms and consent (16 h) — feature 18 · Large (done)

**Plan:** `.claude/plans/feature-primolar-privacy-plan/`
**Status:** built 2026-10-14

- Template documents in the app: Terms of Service, Data Processing Agreement, Primolar Privacy Policy, a clinic
  privacy notice template and a parent consent form, each with a version.
- Get started: a required, unticked "I accept the Terms and the Data Processing Agreement" with links; the
  acceptance (version, time) is saved on the sign-up and carried to the clinic. Console direct creation: "signed
  agreement on file".
- Patient registration: the parent's consent recorded (who recorded it, when, which notice version), shown on the
  child's record, with a printable consent form.
- Parent portal: the clinic's privacy notice once on first sign-in, acknowledged.
- Settings → Clinic: the clinic's privacy notice, from the template, editable by the Owner.
- "Privacy" and "Terms" links on sign-in, Get started and the portal.
- Demo data: existing patients with consent on record, and one without, to show the prompt.

**Done when:** a clinic can't sign up without accepting the terms; a child can't be registered without the parent's
consent recorded; a parent sees the clinic's notice once and the acknowledgement is saved; a new version of a
document asks again; every record shows who accepted which version and when.

**Depends on:** 23.

## Chunk 18: Demo polish and deploy (6 h)

- A realistic demo scenario in the seed: one child mid-treatment, one due for recall, one with a
  balance.
- Responsive check at phone width; keyboard pass; empty and error states.
- Deploy to Vercel; write a 5-minute demo script for the client.

**Done when:** the client can open a link and walk the demo script without your help.

**Depends on:** all, 24 included. Built last so the demo, deploy and video show the whole product: several
clinics, branches, clinic branding, the operator console, sign-up and billing. Already done: the demo data,
the responsive and keyboard pass, the deploy (https://primolar.vercel.app) and `DEMO_SCRIPT.md`. Left: the
video, after chunk 24 and a round of testing.

---

## Order at a glance

```
0 Foundation ✅
1 UI kit ─┬─ 2 Clinic setup ──────────────┐
          └─ 3 Patient profile            │
               └─ 4 Visits ─┬─ 5 Chart display ─ 6 Chart editing ─ 8 Growth
                            ├─ 7 Notes + behavior ──────┐
                            ├─ 15 Photos                │
                            └─ 10 Appointments ◄── 2    │
6 + 7 + 2 ─ 9 Treatment plan ─ 12 Billing ─ 13 Dashboard
7 + 10 ─ 11 Follow-ups & recalls ─ 14 Messages
9 + 12 ─ 16 Documents
10 + 11 + 12 + 14 + 15 ─ 17 Parent portal
17 ─ 19 Tenancy foundation ─ 20 Owner settings & branding ─ 21 Cross-branch & operator ◄── 13
21 ─ 22 Sign-ups & branding choices ─ 23 Subscriptions & payments ─ 24 Privacy, terms & consent
everything, 24 included ─ 18 Polish & deploy (video left)
```

Chunks 5–6 (the chart) carry the most risk. If time gets tight, cut scope from 17 (portal) and 13
(dashboard), not from the chart.

---

# Legacy lessons (from the MyMedsPH review)

Plans in `.claude/plans/legacy-lessons/`. Status as of 2026-10-03:

- ✅ Theme Light / Dark / System and a PIN staff switch (items 18–19).
- ✅ Dashboard: Today at a glance for all staff, today's appointments, birthdays with Send greeting, new vs returning
  chart (items 1–4).
- ✅ Patient list: one-tap filters, Recall due / Balance due / No contact labels, last visit and balance, paging and
  sort (items 5–7).
- ✅ Patient record: photo, nickname, header facts, quick update, optional profile, services and prices on notes,
  notes report PDF (items 8–14).
- ✅ Dental chart: exam checkbox sections, one finding on several teeth (items 15–16).
- ✅ Calendar: month counts on phones; a booked day is never shown as closed (item 17).
- ✅ Part B sweep (2026-10-04).
- ✅ Contact details are left out of every patient response for roles without `patients.contact` (2026-10-04).
- ✅ A completed checkup or cleaning closes a due 6-month recall (2026-10-04).

