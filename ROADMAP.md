# Roadmap: Pediatric Dental Clinic (frontend prototype)

Two parts:

1. **Features**: what each of the 15 features does, its screens, its data, and its rules.
2. **Build chunks**: the order to build them in. Each chunk is small enough for one or two sessions,
   depends only on chunks above it, and ends with a "done when" you can check.

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
- **Prototype:** a "view as parent" demo login picks a guardian.
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
- **Later:** S3 or R2 with presigned uploads, as decided.

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

---

# Part 2: Build chunks (in order)

Total ≈ 153 hours. Hours are estimates for one developer using Claude Code.

## ✅ Chunk 0: Foundation (done)

Workspace, shared schemas and domain logic, MSW mock layer, app shell with role switcher, patient
list, patient header, provenly. Tests green.

## Chunk 1: UI kit (6 h)

**Goal:** stop hand-styling every input before the forms pile up.

- Add shadcn/ui: button, input, label, select, textarea, checkbox, dialog, sheet, tabs, toast, badge,
  dropdown-menu.
- Build one `FormField` wrapper for React Hook Form + Zod (label, input, error message).
- Add a "Reset demo data" button to the shell.

**Done when:** a sample form uses only kit components, and errors show under each field.

## Chunk 2: Clinic setup data (6 h)

**Goal:** the reference data that appointments, plans and billing all need.

- Schemas and seed data: dentists and staff, chairs, procedure catalog (code, name, default
  duration, fee in centavos, follow-up rule).
- A read-only Settings page that lists them (editing comes later if needed).

**Done when:** the procedure catalog loads through MSW and is validated by the shared schema.

**Depends on:** 1.

## Chunk 3: Patient profile complete (10 h) — feature 1

- Create and edit forms: guardians (add or remove, mark primary), emergency contact, allergies,
  conditions, medications, dental history, alerts.
- Consent records: add a record with guardian, scope and date.
- Patient record page with tabs: Overview, Chart, Notes, Plan, Photos, Billing, Documents (empty
  tabs are fine).

**Done when:** you can create a patient, refresh, and still see them; the alert banner shows on
every tab.

**Depends on:** 1.

## Chunk 4: Visits (6 h)

**Goal:** the backbone. Chart entries, notes, behavior, photos and payments all attach to a visit.

- `Visit` schema (patient, date, dentist, appointment link, status) plus mocks.
- "Start visit" on the patient record; a visit list on the Overview tab.

**Done when:** a patient has visits, and the current visit is clear in the UI.

**Depends on:** 3.

## Chunk 5: Dental chart, display (12 h) — feature 2, part 1

- An SVG tooth component with 5 clickable surface zones (incisal edge for front teeth).
- Full chart layout that matches the paper chart: quadrants, primary row, primary / permanent /
  mixed toggle.
- Renders conditions from `deriveChart()` with a legend; colors also use pattern or lightness.

**Done when:** seeded chart entries show correctly in all three modes, keyboard-focusable.

**Depends on:** 4.

## Chunk 6: Dental chart, editing and history (12 h) — feature 2, part 2

- Tooth panel: pick surfaces and a condition, add a note, save as a chart entry for the current visit.
- Correct a finding (a superseding entry), never edit in place.
- Per-tooth history list; "chart as of visit" selector.

**Done when:** you can record caries on 74-O, restore it in a later visit, and see both in history.

**Depends on:** 5.

## Chunk 7: Clinical notes + behavior tracking (12 h) — features 3 and 9

- A template renderer that builds a form from `NoteTemplate.fields`.
- Seed all 11 templates. The oral exam template matches the paper chart.
- Behavior multi-select inside each note; trend strip on the patient Overview.
- Sign a note to lock it.

**Done when:** signing a pulpotomy note works and the note becomes read-only.

**Depends on:** 4. Use chunk 6's tooth picker for the "teeth" field type.

## Chunk 8: Growth and development (4 h) — feature 10

- A per-visit record: habits with started and stopped dates, speech observations.
- Dentition stage and eruption status read from the chart.
- A timeline on the Overview tab.

**Done when:** a habit recorded in one visit and marked stopped in a later one shows correctly on
the timeline.

**Depends on:** 6.

## Chunk 9: Treatment plan and progress (10 h) — feature 11

- Plan items from the procedure catalog, optionally tied to a tooth, with a fee.
- "Add to plan" from a chart finding.
- Items complete when a matching note is signed; progress bar.

**Done when:** the spec's example plan (cleaning, fluoride, 51, 74, 84, follow-up) shows 3 of 6 done.

**Depends on:** 2, 6, 7.

## Chunk 10: Appointments (14 h) — feature 4

- Day view by chair (react-big-calendar resources), plus week and month views.
- Create, reschedule, cancel; the status flow; no-show tracking on the profile.
- Double-booking checks in the mock handler (so the backend copies the rule).
- "Start visit" from an arrived appointment.

**Done when:** you can book, move, check in, and finish an appointment, and a no-show counts on the
patient.

**Depends on:** 2, 4.

## Chunk 11: Follow-ups and recalls (8 h) — features 14 and 15

- Signing a note whose procedure has a rule creates a due item (`dueDateFor`).
- A "Recalls" page with overdue, this week and this month lists, and one-tap booking.

**Done when:** an extraction signed today shows as due in 7 days, and booking it removes it from
the list.

**Depends on:** 7, 10.

## Chunk 12: Billing and payments (12 h) — feature 7

- Create an invoice from done plan items, with a discount.
- Record payments (method, reference number), partial payments, and refunds as negative payments.
- Patient statement and a printable acknowledgment receipt.

**Done when:** the ₱8,500 / ₱5,000 / ₱3,500 example reproduces exactly, using `invoiceBalance`.

**Depends on:** 9.

## Chunk 13: Financial dashboard (5 h) — feature 8

- Recharts: collections by day, week and month; revenue by procedure; method breakdown.
- Outstanding balances and unpaid appointments tables.
- Admin only.

**Done when:** dashboard totals match the sum of seeded payments.

**Depends on:** 10, 12.

## Chunk 14: Parent messages (8 h) — feature 5

- Template editor with placeholders and live preview.
- An event → queued message hook for booking, reminders, no-shows, post-op notes, recalls and
  birthdays.
- A message log page.

**Done when:** booking an appointment queues a confirmation and a reminder with the child's name
filled in.

**Depends on:** 10, 11.

## Chunk 15: Clinical photos (6 h) — feature 12

- Upload or take a photo (`<input capture>`), compress in the browser, store in IndexedDB.
- Gallery by visit and type; before ↔ after slider.

**Done when:** before and after photos of one tooth compare side by side after a refresh.

**Depends on:** 4.

## Chunk 16: Document generation (8 h) — feature 13

- PDF templates for all 9 document types, filled from patient, chart, plan and billing data.
- Preview, download, and a log on the patient record.

**Done when:** a dental certificate and a receipt download with correct data and no retyping.

**Depends on:** 9, 12.

## Chunk 17: Parent portal (8 h) — feature 6

- A `(portal)` layout with "view as parent" demo login.
- Appointments (view, confirm, request), treatment plan, invoices, instructions, uploads.
- Ownership enforced in the mock handlers: a parent gets only their own children.

**Done when:** a parent sees one child's data and gets 403 for another child's.

**Depends on:** 10, 11, 12, 14, 15.

## Chunk 18: Demo polish and deploy (6 h)

- A realistic demo scenario in the seed: one child mid-treatment, one due for recall, one with a
  balance.
- Responsive check at phone width; keyboard pass; empty and error states.
- Deploy to Vercel; write a 5-minute demo script for the client.

**Done when:** the client can open a link and walk the demo script without your help.

**Depends on:** all.

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
everything ─ 18 Polish & deploy
```

Chunks 5–6 (the chart) carry the most risk. If time gets tight, cut scope from 17 (portal) and 13
(dashboard), not from the chart.
