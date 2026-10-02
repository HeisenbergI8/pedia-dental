# Clinical Domain — designing a pediatric dental system

Health IT has its own human-factors literature because UI errors here harm patients. Sources: NIST IR
7804 / 7804-1 (EHR usability validation), NIST IR 7865 (human factors guide for critical use risks),
NIST IR 7988 (EHR in clinical workflow), and research on interruptive alert design (alert fatigue).

## The critical use risks (design against these first)

NIST identifies three recurring EHR failure classes:
1. **Identification:** acting on the wrong patient. The top cause of serious EHR-related harm.
2. **Consistency and integrity of information:** the same data displayed differently in two places,
   ambiguous units or formats, truncated values.
3. **Lost or scattered information:** data entered but not visible where the next decision is made;
   the same fact in several places.

### 1. Patient identification
- **Persistent patient banner** on every patient-context screen (`PatientHeader`): full name, age (in
  years *and* months under 3), sex, a photo or initials avatar, patient ID, date of birth, and
  **allergies and alerts**. It stays visible while scrolling.
- Always show **two identifiers** (name + DOB or ID). Children often share surnames with siblings in
  the same clinic, so add a **sibling-collision warning** when the same guardian has several patients.
- **Name formatting is consistent everywhere:** "Cruz, Ana Marie" or "Ana Marie Cruz", one rule
  app-wide. Never truncate a surname. Truncate given names with a tooltip if necessary.
- When the context switches patient (search, next appointment), make the change unmistakable: the banner
  updates, the page title updates and the scroll resets.
- Avoid having two patients open side by side in the same view unless it's an explicit compare feature.

### 2. Consistency and integrity
- **One format per data type**, everywhere: dates as `12 Mar 2026` (unambiguous, avoiding 03/12 vs
  12/03), times in 12-hour with am/pm (local convention), money as `₱1,500.00` via `formatPeso`, teeth
  as FDI numbers with names available, ages as "7 y 4 m".
- **Units always shown** (kg, cm, mg).
- **Never truncate clinical text silently.** Use an ellipsis plus expand, and show the full text in the
  print view.
- **Computed values look computed** (balances, BMI percentiles): they're labeled, come with an "as of"
  where relevant, and are never presented as editable.
- **Append-only history is legible:** corrected entries stay in place, muted and struck through, with a
  "Corrected on 12 Mar by Dr. Reyes: reason" link to the replacement. The current truth is visually
  dominant.

### 3. Information where the decision happens
- Allergies are visible **at the moment of prescribing or charting a procedure**, not only on the
  overview tab.
- When recording a visit, show the treatment plan's next items and the last visit's notes alongside.
- A balance due is visible at check-in and check-out, the two points where front desk acts on it.

## Alerts without alert fatigue

Clinicians override ~90% of interruptive drug alerts because most are false or low value. Every
unnecessary alert devalues the necessary ones.

**Tier alerts by severity × accuracy:**
| Tier | Example | Presentation |
| --- | --- | --- |
| Critical (interruptive) | Charting a procedure requiring an anesthetic the patient is allergic to | Modal at the moment of action; corrective action as a button; override requires a reason |
| Warning (non-interruptive, prominent) | Allergy present, medical condition (asthma, bleeding disorder), unpaid balance > 90 days | Persistent banner or badge in context; no click required |
| Informational (passive) | Recall due, birthday, incomplete profile | Subtle badge or indicator; discoverable, not pushed |

**Writing an alert** (evidence-based style elements):
- Short sentence-case title. **2–3 sentences (≤ ~30 words):** why it fired, the risk, and the action.
- Bold at most twice. No ALL CAPS, which reduces comprehension.
- At most four colors in the alert system: red (act now), orange (urgent), yellow or blue
  (informational). **Always add an icon**, never color alone.
- Offer the **corrective action directly** ("Remove lidocaine from plan"), not just "OK".
- Overrides capture a reason, and dismissals state their scope and duration ("Hide for this visit").

The allergy `alert`/`alert-bg` tokens are reserved for clinical alerts. Don't reuse them for "unsaved
changes" or marketing banners.

## Users and contexts

| Role | Context | Design implications |
| --- | --- | --- |
| **Dentist** | Chairside, gloved or touching the patient, often on a tablet, constantly interrupted | Big targets (≥44 px), minimal typing (pickers, templates, quick-codes), resumable state, glanceable chart, voice of the record is clinical |
| **Assistant / hygienist** | Charting while the dentist calls findings | Fast tooth selection by keyboard and tap, surface quick-pick, undo of the last entry |
| **Front desk** | Phone in one hand, queue at the counter, high volume | Keyboard-first, global search, check-in in ≤3 actions, today's schedule as home, balance visibility |
| **Admin** | Infrequent configuration | Clarity over speed, explanations inline, safe defaults, preview of the effect of a setting |
| **Parent (portal)** | Mobile, low frequency, possibly anxious, varied literacy, may share a device | Plain language (~grade 6–8), 16 px+ text, one task per page (GOV.UK pattern), reassurance, privacy cues |

## Domain-specific UI patterns

- **Tooth chart (odontogram).**
  - FDI layout from the clinician's view: quadrants 1|2 on top, 4|3 on the bottom, patient's right on
    screen left. Primary dentition (51–85) is shown for kids, and mixed dentition handled clearly
    (erupted, unerupted, exfoliated). Generate it with `domain/teeth.ts`, never hand-placed.
  - Surfaces (M, O/I, D, B/F, L/P) are selectable within a tooth.
  - Distinguish **existing conditions** from **planned treatment** from **completed today**. This is the
    standard dental convention: commonly red for planned or needed, blue for completed or existing,
    always backed by a glyph and legend.
  - Selection must be unmistakable before committing an entry (wrong-tooth is a never event): show
    "Charting on 55 · upper right second primary molar" in the entry form.
- **Treatment plan:** phased, with per-item status and cost, and a running total. Make "accepted by
  guardian" an explicit state.
- **Visit flow:** check-in → chair → chart and notes → charges → sign-off → checkout. Show progress and
  surface unsigned visits as unfinished work (Zeigarnik).
- **Clinical notes:** templates with smart fields, but the result reads as natural text; show the
  author and timestamp; sign-off locks the note (corrections are addenda).
- **Growth charts:** plot against percentile bands (WHO/CDC) as background context, with the latest
  value and percentile labeled directly.
- **Billing:** balance computed from payments (never typed). Each payment row shows method, receipt
  reference and who recorded it. Voids are explicit, with a reason.
- **Recall:** a work queue sorted by most overdue, a contact-attempt log, and one-click "mark
  contacted" with an outcome.

## Tone

- **Staff screens:** precise, neutral and calm, like a well-made instrument.
- **Portal:** warm and reassuring, with child-friendly touches allowed (an illustration in empty states,
  a friendly greeting). Still credible. Parents are trusting you with their child's health.
- **Copy:** use the clinic's words, keep it short and active, and never blame the user. Error: "We
  couldn't save the payment. Check your connection and try again." Avoid "Error 500" and "Invalid".
