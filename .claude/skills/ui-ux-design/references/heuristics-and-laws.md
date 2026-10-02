# Heuristics and Laws — the diagnostic vocabulary

Use these to **name** a problem and **justify** a fix. A finding cites one of these; a recommendation
explains which one it satisfies.

## Nielsen's 10 usability heuristics (applied, not recited)

| # | Heuristic | What it looks like done badly here | Expert fix |
| --- | --- | --- | --- |
| 1 | Visibility of system status | Save button with no pending state; silent background refetch overwriting a form | Pending + success feedback within 100 ms; "Saved 2 min ago" for autosave; stale indicators |
| 2 | Match the real world | "Entity", "record", "supersede" in UI copy; tooth IDs shown as raw ints | Clinic vocabulary: "Correct entry", "Visit", "Recall"; FDI tooth with its name on hover ("55 · upper right second molar") |
| 3 | User control & freedom | Dialog with no Escape; multi-step form loses input on back | Escape closes, back keeps state, **undo over confirm** for reversible actions |
| 4 | Consistency & standards | Same action called Save/Submit/Update on different screens; primary button on the left here, right there | One verb per action app-wide; action placement fixed by pattern (see interaction-patterns) |
| 5 | Error prevention | Free-text date; deleting a patient with balance; charting on the wrong tooth | Constrained inputs, sensible defaults, confirm with the *object named*, disable impossible options with an explanation |
| 6 | Recognition over recall | User must remember a patient ID or procedure code | Search by name/phone/guardian; recent patients; pickers showing code + description |
| 7 | Flexibility & efficiency | Mouse-only flows for front desk doing 80 check-ins a day | Keyboard shortcuts, `⌘K` patient search, bulk actions, remembered filters. Accelerators are invisible to novices |
| 8 | Aesthetic & minimalist design | Every field of the patient shown at equal weight | Show what the current task needs; the rest goes behind a disclosure. Minimalism is about **relevance**, not emptiness |
| 9 | Help users recover from errors | "Invalid input"; error toast that vanishes | Inline, specific, polite, actionable: "Enter the guardian's mobile number, like 0917 123 4567" |
| 10 | Help & documentation | Tooltips explaining what should have been a better label | Contextual help next to the hard concept only (e.g. recall interval rules) |

**Severity scale (Nielsen):** 0 not a problem · 1 cosmetic · 2 minor (fix when convenient) · 3 major
(high priority) · 4 catastrophe (fix before release). In a clinical tool, anything that can lead to a
wrong-patient, wrong-tooth or wrong-amount error is **4** no matter how rare.

## Norman's design principles

- **Affordances & signifiers.** Clickable things look clickable: a row that opens a patient needs
  hover state, cursor and ideally a chevron or a link-styled name. Flat text that turns out to be a
  button is a signifier failure.
- **Mapping.** Controls sit next to what they affect. The tooth chart's layout mirrors the mouth from
  the clinician's view (patient's right is on screen left, which is the dental convention).
- **Feedback.** Every action gets an immediate, proportional response.
- **Constraints.** Make the wrong action impossible rather than warned-against.
- **Conceptual model.** The UI should reveal the model: a visit *contains* chart entries, notes and
  charges. If the navigation scatters them, users build the wrong model.
- **Gulfs of execution & evaluation.** Can they figure out *how* to do it? Can they tell *whether it
  worked*?

## Laws of UX — the ones that move decisions

- **Hick's law.** Decision time grows with the number of choices. Cap visible primary actions; group
  the rest in an overflow menu. Long selects → searchable combobox.
- **Fitts's law.** Time to hit a target depends on its size and distance. Make frequent targets big and
  near the cursor's natural path: primary action near the end of the form, row actions on the row.
  Screen edges are infinitely deep, so use them for nav.
- **Jakob's law.** Users spend most of their time in *other* software. Use conventions: search top-left
  or top-center, user menu top-right, tables sort on header click, `Esc` closes.
- **Miller's law / working memory / chunking.** Don't make users hold information across screens.
  Chunk phone numbers (0917 123 4567), IDs and long forms into labeled groups of ~5±2.
- **Cognitive load (intrinsic vs extraneous).** You can't remove the intrinsic complexity of dentistry
  (that's **Tesler's law**), but you can remove all the extraneous load: inconsistent layouts,
  decoding icons, hunting for actions.
- **Gestalt: proximity, common region, similarity, uniform connectedness.** Space between groups must be
  clearly larger than space within groups (a ratio of ≥1.5–2× is a good rule of thumb). Labels sit closer
  to their field than to the previous field.
- **Von Restorff (isolation) effect.** The one thing that differs gets noticed. Spend it on the
  allergy alert or the primary action, never on decoration.
- **Serial position effect.** First and last items are remembered best. Put the most important nav items
  and form fields there.
- **Doherty threshold (<400 ms).** Keep interactions under 400 ms perceived. Use optimistic updates and
  skeletons for anything slower; never block input on a spinner for a local mock.
- **Goal-gradient & Zeigarnik.** Show progress in multi-step flows (patient intake, visit wrap-up) and
  make unfinished work visible ("2 visits not signed off").
- **Peak-end rule.** The end of a flow is remembered. Finish visit sign-off and payment with a clear,
  satisfying confirmation and the obvious next step.
- **Postel's law.** Be liberal in what you accept (phone formats, dates typed many ways, pasted
  data) and strict and consistent in what you display.
- **Aesthetic-usability effect.** Polish buys tolerance, but it also hides real usability problems in
  tests. Never use it as evidence that something works.
- **Paradox of the active user.** Nobody reads instructions. Make the UI teach through defaults,
  placeholders-as-examples (never as labels), and empty states.

## Shneiderman's eight golden rules (where they add to the above)

- **Design dialogs to yield closure.** A sequence has a beginning, middle and end with clear feedback.
- **Support an internal locus of control.** Experts want to feel the system responds to *them*. Avoid
  surprise auto-navigation, auto-advancing steps and modal interruptions.
- **Reduce short-term memory load.** See Miller.
