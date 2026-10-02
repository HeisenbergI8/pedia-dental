# Interaction Patterns

Choose patterns by **task frequency, risk and context**, not by what's quickest to build.

## Choosing a container: page vs sheet vs dialog vs inline vs popover

| Use | When | Avoid when |
| --- | --- | --- |
| **Inline edit** | Single field, frequent, low risk (a note, a status) | It changes several related fields or money |
| **Popover** | Picking a value, quick filters, small read-only previews | It has a form with validation |
| **Dialog (modal)** | Short focused decision or form (≤ ~6 fields), **confirmations** | Long forms; anything needing reference to the page behind it |
| **Sheet (side panel)** | Create or edit while keeping list context visible (add payment, quick patient view) | Multi-step flows |
| **Full page** | Long or complex forms (patient intake), multi-step, shareable state | Quick edits |

Never stack modals. Never open a modal on page load except for a high-severity, high-accuracy clinical
alert (see clinical-domain).

## Forms (the bulk of this app)

Grounded in GOV.UK Design System and Baymard research:

- **Labels above fields**, always visible. Never use the placeholder as the label. Use a placeholder only
  as a format example, or not at all.
- **Single column.** Multi-column forms cause skipped fields and zig-zag scanning. Exceptions: tightly
  related short pairs (first/last name, city/postal code, systolic/diastolic).
- **Group with fieldsets and legends** (Guardian, Medical history, Insurance). A group heading
  replaces repeating the word in every label.
- **Field width signals expected length:** a 4-digit year field shouldn't span 600 px.
- **Mark optional fields "(optional)"**, not required ones with `*`. Most fields should be required, or
  else ask why the field exists.
- **Right input type:** `tel` for phones, `inputMode="numeric"` for codes (not `type=number`, which
  breaks leading zeros and scroll-wheels values), date pickers that also accept typed dates, radios for
  ≤5 visible options, a select or combobox for more, a toggle only for an *instant* on/off setting.
- **Smart defaults** from context: today's date, the logged-in dentist, the patient's last guardian,
  and the previously used procedure fee. This is also WCAG 3.3.7 Redundant Entry.
- **Validate on submit, then live once a field has errored** ("reward early, punish late"). Don't
  flag errors while someone is still typing their first attempt.
- **On error:** show an error summary at the top (focus moves to it; links jump to fields) *and* an
  inline message under each field. Messages say what happened and how to fix it, in plain words. Keep
  the user's input, and never clear the form.
- **Primary action at the end of the form, aligned with the fields' left edge** (or right-aligned in
  dialogs, matching the kit). Cancel is a secondary or ghost button, never equal weight.
- **Button labels are specific verbs:** "Save patient", "Record payment ₱1,500", "Sign off visit".
  Avoid "Submit" and "OK".
- **Disabled submit buttons hide the reason.** Prefer an enabled button that validates and explains.
  If you must disable, put the reason next to it.
- **Long forms:** a sticky action bar, section anchors, and an unsaved-changes guard on navigation.
- Use `components/form-field.tsx` for every field so label, hint, error and `aria-describedby` wiring
  stay consistent.

## Tables and lists (patients, visits, billing, recall)

Support the four table tasks (NN/g): **find** records, **compare** records, **view/edit one** record, and
**act** on records.

- **Column choice:** fewer, better columns. Lead with the identifying column (patient name with a small
  avatar or initials and age), and push secondary detail into a second line inside the cell instead of
  adding columns.
- **Alignment:** text left, numbers and money right with tabular figures, short status badges left,
  and the header aligned like its data.
- **Sticky header**; a sticky first column if the table scrolls horizontally.
- **Sorting:** click the header, show the direction indicator, and use a sensible default sort (recall:
  most overdue first; patients: recent activity).
- **Filtering:** frequent filters visible as chips or segments ("Overdue · Due this month · All"),
  rare ones in a filter popover. Show active filters with a one-click clear. Reflect filters in the URL
  so they survive refresh and can be shared.
- **Search:** forgiving (name, phone, guardian, ID), debounced ~200 ms, with match highlighting.
- **Row actions:** the whole row opens the record (a real link, so middle-click works); the 1–2 most common
  actions appear inline or on hover, the rest go in a `⋯` menu. Hover-only actions must also be
  reachable by keyboard focus and on touch.
- **Bulk actions** appear in a contextual bar once rows are selected ("3 selected · Send recall ·
  Clear").
- **Empty vs no-results** are different states. First use says "No patients yet. Add your first
  patient" with the action. No results says "No patients match 'Santo'. Clear search".
- **Pagination vs infinite scroll:** for work queues, paginate or virtualize with a visible total count.
  Infinite scroll loses position and breaks "find it again".
- **Loading:** skeleton rows matching the real layout, never a centered spinner that shifts the page.

## Navigation and wayfinding

- **The sidebar is for places, not actions.** Keep it short (≤7–9 items), filtered by role (`NAV` in
  `components/app-shell.tsx`), and highlight the active item with more than color (weight plus an
  indicator bar).
- **Page title = the nav label** that took you there, so a click is always confirmed.
- **Breadcrumbs or a back link** on detail pages ("← Patients"). Back should preserve the list's filters
  and scroll position.
- **Tabs** for peer views of one object (Patient: Overview · Chart · Visits · Billing · Growth). Use
  them only when the user doesn't need to compare tabs side by side. Keep the tab state in the URL.
- **Global patient search** (`⌘K` / `/`) is the single highest-value accelerator in a clinic app.
- Keep **"coming soon"** screens honest, but don't let them dominate the nav. Mark them subtly.

## System feedback

| Event | Feedback |
| --- | --- |
| Action under 100 ms | The state change itself is the feedback |
| Action 0.1–1 s | Button pending state (spinner in button, label kept, double-submit blocked) |
| Action over 1 s | Skeleton or progress, and the user can keep working elsewhere |
| Success, low stakes | Brief toast (sonner), or nothing if the change is visible on screen |
| Success, high stakes | Persistent confirmation with the outcome and next step (payment recorded → print receipt) |
| Error, recoverable | Inline, near the cause, with a retry |
| Error, blocking | Persistent banner; never a toast that disappears |

Toasts: one at a time, ~4–6 s, and pause on hover. **Never put the only path to an action in a toast**,
except "Undo".

## Destructive and irreversible actions

- **Prefer undo over confirm** for reversible actions (archive, cancel appointment): do it, then show
  "Appointment cancelled · Undo" for ~8 s.
- **Confirm for truly irreversible actions**, and make the dialog specific: title names the action and
  object ("Void payment of ₱1,500 for Ana Cruz?"), body states consequences, buttons repeat the verb
  ("Void payment" / "Keep payment"). Use typed confirmation only for catastrophic, rare actions.
- In this domain, "delete" is usually wrong anyway: chart entries and payments are **corrected or voided
  with a reason**, so design that flow instead.

## Optimistic UI

Use it for low-risk, high-frequency actions (toggle, mark reminder sent). Don't use it for money or
clinical records, where the user must see confirmed state. Roll back visibly on failure.

## Keyboard and efficiency

- Logical tab order following the visual order; no positive `tabindex`.
- `Enter` submits single-step forms, `Esc` closes overlays, arrow keys move within composite widgets
  (Radix handles this, so don't break it).
- Shortcut hints shown in tooltips and menus (`⌘K`), discoverable rather than required.
