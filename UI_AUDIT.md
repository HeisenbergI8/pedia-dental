# UI audit: Kidsmile clinic app

**Status:** all four steps done 2026-10-03 (audit → foundation → modules → final pass). Results in section 8.
**Audited:** 2026-10-03, production build (`next build` + `next start`), with seeded demo data.

## 1. How this was audited

- **Measured, not guessed.** I used a Playwright sweep of every route (28 screens and states, counting the
  patient-record tabs and calendar views) at **360, 390, 430, 768, 1024, 1280, 1440 and 1920 px**. For each one I recorded:
  horizontal overflow and the element causing it, interactive elements under 44 px and under 24 px, text under 16 px and
  under 12 px, tables wider than their container, and **axe-core** WCAG 2.2 AA violations (at 390 and 1440).
- **Looked at.** I reviewed full-page screenshots at 390, 768 and 1440 for every screen.
- **Read.** I checked the kit (`components/ui`), the shell, tokens and feature components for states, forms, input types,
  confirmations, deep links and arbitrary values.
- **Severity:** **high** = S3–S4 (S4 means a wrong-patient, wrong-tooth or wrong-amount risk), **medium** = S2,
  **low** = S0–S1. **Scope:** `token` (globals.css), `kit` (shared components), `screen`. Fix token and kit issues
  first, because each one resolves many screen findings.

**Not verified:**
- Real on-screen keyboards (iOS and Android) and OS-level large text. I checked 200% zoom only by reasoning,
  not with a device.
- Tablet landscape at 1024×768 for the chart. I measured 1024 wide at 1024 tall.
- The 1x1 px "targets" the sweep reported are visually hidden radio inputs inside labelled groups, and the
  32×16 "Skip to content" link only appears on focus. Both are false positives and are excluded below.

### What is already good, and stays

- The **brand layer**: Kidsmile logo, logo teal as the primary colour, the crayon palette as decoration only,
  Fredoka titles, and a logo loader.
- **No raw hex in components** (0 outside the PDF renderer, which can't read CSS variables). There are 23 arbitrary values, mostly
  calendar and chart minimum widths and shadcn's `ring-[3px]`.
- **No page-level horizontal scroll on 27 of 28 screens.** The dashboard on phones is the exception.
- The **patient header** keeps identity and allergies on top at every width (a project non-negotiable). The **patient list**
  already turns into cards on phones.
- **Cancel appointment** asks for a reason. Refunds need a reason. Billing money uses `formatPeso` and is right-aligned.
- The **portal** already uses 16 px+ text and 44 px targets and reads plainly.

## 2. Decisions

**Resolved 2026-10-03: the user accepted every recommendation below** (personality as stated, both avoid-rules, no dark mode, the module order, yes to 5a/5b/5c, kiosk out of scope).
**Superseded 2026-10-03: item 3 (dark mode).** The legacy-lessons brief (item 18) asks for Light, Dark and System. Built by
`.claude/plans/legacy-lessons/feature-theme-staff-switch-plan`: dark tokens in `globals.css`, screen-only, so receipts print
white and PDFs stay white. The logo sits on a white plate in dark rather than being recoloured. DESIGN_SYSTEM.md §2a has the rules.

The brief's brand fields were placeholders, so these are my assumptions, drawn from the Kidsmile logo and Facebook page:

1. **Brand personality:** *warm, playful, gentle, trustworthy, clean.* Correct?
2. **Avoid:** anything that feels like a hospital (cold grey-blue, clinical sterility) **and** cartoon chrome on
   staff screens (bouncy cards, mascots, playful fonts on data). Correct?
3. **Dark mode** *(superseded 2026-10-03, see above)*: I recommend **not now**. Clinics are bright rooms, receipts and documents print on white, and the
   logo artwork is drawn for white. Tokens stay semantic, so it can be added later. Agree?
4. **Module order** (highest traffic first): Appointments → Patient record and Chart → Patients list and intake →
   Billing → Recalls → Messages → Dashboard → Documents and Settings → Portal. Correct?
5. **Flagged changes that touch more than visuals.** Each needs a yes or no:
   - **a.** Put the patient-record tab and the calendar date and view **in the URL** (`?tab=chart`, `?date=…&view=…`).
     Routes stay the same and only query parameters are added. This makes refresh, back and links-to-a-tab work.
   - **b.** **No-show gets an undo**, or a confirmation, because it queues a "missed appointment" SMS. This is
     a UI-only change in the prototype.
   - **c.** **Messages log paginates** (25 per page) instead of rendering everything. The UI asks the mock for a page.
6. The brief mentions a **check-in kiosk**. **This app has no kiosk.** The only patient-facing surface is the parent
   portal. Should a kiosk be designed, or is it out of scope?

## 3. Proposed design direction

The rebrand already moved the app off a default template. This step **systematises it into tokens and patterns and
carries it into every module**, rather than starting over.

### Palette (all pairs to pass AA; ratios measured on white unless noted)

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary | `brand` | `#17686e` (6.5:1) | Primary buttons, selection, links. The logo's teal, deepened for text. |
| Primary tint | `brand-subtle` / `brand-soft` | `#e3f3f3` / `#7ec4c6` | Selected rows and nav / decorative fills only |
| Secondary | `plum` (new) | logo purple `#694ab4` (6.9:1) | Secondary emphasis: portal highlights, "new" markers, focus of kid moments. Never status. |
| Warm surface | `sunny` (new) | `#fff6dc` | Celebration and empty-state backdrops, portal hero. Never status. |
| Success / Warning / Danger / Info | triples (fg, bg, line) | green / **amber (new, distinct from the clinical alert brown)** / red / blue | Status only, always with icon and text |
| Clinical alert | `alert` | existing brown-orange | Allergies and conditions only, as now |
| Ground / surface / raised | existing + `surface-raised` (new) | mint-white / white / white + shadow | Three elevation levels |

The crayon colours stay **decoration only**: the brand strip, logo, loader, illustrations.

### Typography

- **Display:** Fredoka 500/600, echoing the logo's rounded letters. Page titles, card titles, portal greetings and
  empty-state titles only, never on data.
- **Body:** Figtree. It is highly legible, with more warmth than Inter, and it is already loaded.
- **Scale (new token set):** 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36. **Body is 16 px on phones** (the brief's rule and
  iOS's no-zoom rule) and **14 px for dense data at ≥ md**. Labels are never under 12 px. Tabular figures for money, times and counts.

### Motif: the toothbrush line

- **Shape language:** soft radii (10 px base) and **pill** shapes for chips, segmented controls and the child switcher.
  Pills echo the toothbrush handle.
- **The crayon strip** marks the top of every shell. This is done.
- **The hand-drawn offset shadow** from the logo (an outline plus a 2 px crayon offset) is used **only** on illustrations,
  empty states and success moments, never on data cards.
- **Illustrations:** a small set of outlined, crayon-filled spot illustrations in the logo's style (tooth, toothbrush,
  calendar, bubbles), used in empty states and the portal.
- **Success moment:** a brief sparkle on the tooth icon plus the toast. A big moment such as a completed treatment plan in the
  portal gets the logo's bubbles. Both stay still under reduced motion.
- **Pediatric warmth lives in the portal, login, empty states and copy.** Staff data screens stay a calm, precise instrument.

### Motion and z-index (new tokens)

- `--duration-fast` 120 ms (hover, press), `--duration-base` 200 ms (overlays in), `--duration-slow` 320 ms (page
  and sheet). Easing is ease-out to enter and ease-in to exit. Everything respects `prefers-reduced-motion`.
- Z-index scale: base, sticky (20), header (40), overlay (50), toast (60).

### Loading strategy (refines the current loader)

- **Logo loader:** app start, sign-in, and page-to-page navigation, as now.
- **Skeletons** (new kit component): content inside an already-open page (lists, cards, the chart). Today all 30
  in-page loads use the logo loader. The brief asks for skeletons here.

## 4. Scorecard

The score is a judgement out of 40 on the rubric's 10 dimensions (task clarity, hierarchy, consistency, efficiency,
states, error prevention, clinical safety, accessibility, craft, responsiveness). The metric columns are measured.

| Screen | Score | High | Med | Overflow | <44 px targets @390 | <16 px text @390 | axe |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Appointments: day/week/month/list | 22 | 4 | 3 | none | 14/19, 35/60, 64/65 | 92–98% | 2 critical (library ARIA) |
| Patient record (overview + tabs) | 28 | 1 | 4 | none | 50% | 68–90% | contrast (tabs) |
| Chart tab | 24 | 2 | 1 | inner scroll | 60/68 | 97% | contrast (tabs) |
| Patients list | 32 | 0 | 2 | none | 5/31 | 62% | none |
| New / edit patient | 26 | 1 | 3 | none | 25/27 | 80% | none |
| Billing (collections) | 26 | 0 | 3 | none | 12/13 | 90% | none |
| Billing tab and receipt | 29 | 0 | 2 | none | 16/24 | 86% | contrast (tabs) |
| Recalls | 24 | 1 | 3 | none | 21/22 | 69% | none |
| Messages | 23 | 0 | 4 | none | 73/74 | 99% | contrast (tabs) |
| Dashboard | 24 | 1 | 3 | **569 px @360, 539 @390** | 28/29 | 65% | aria-hidden-focus ×6 |
| Documents | 30 | 0 | 1 | none | 3/4 | 63% | none |
| Settings | 25 | 0 | 3 | inner scroll | 3/4 | 94% | scrollable-region-focusable |
| Login | 33 | 0 | 1 | none | 4/11 | 48% | none |
| Portal (6 screens) | 31 | 0 | 2 | none | 1–5 per screen | 37–80%* | none |

\* The portal's 16 px rule is mostly met. The counted small text is metadata lines (`text-sm`).

## 5. Cross-cutting findings (fix in the foundation step)

1. **[high][kit] Touch targets are desktop-sized everywhere.** On staff screens at 390 px, **70–98% of interactive
   elements are under 44 px**: Button default 36 px, `sm` 32 px (used 23×), inputs and select triggers 36 px, checkbox
   16 px, tab triggers, and calendar cells (16×20). *Fix:* size tokens with a **touch tier**. At `< lg` and under
   `(pointer: coarse)`, buttons, inputs, tabs and list rows are ≥ 44 px. At desktop with a mouse they keep 36 px density. Add
   spacing between adjacent buttons (≥ 8 px). All breakpoints ≤ 1024.
2. **[high][token] Body text is 14 px on phones.** 65–99% of text on staff screens is under 16 px at 360–430. *Fix:* type
   scale tokens. Reading text and form inputs go to 16 px under `md`, and dense tables stay at 14 px from `md` up (`text-sm` is
   currently hard-coded into components, so this is a kit sweep).
3. **[high][kit] No mobile pattern for tabular data.** The settings tables, dashboard tables, collections and recall rows are
   tables or hand-rolled rows that squeeze on phones (the settings procedure table is 413 px in a 326 px box, with columns
   cut off). *Fix:* a `DataList` component: a semantic table at `≥ md`, and cards showing 2–3 primary fields with
   "View details" at `< md`. The patient list already does this by hand, so it's the model.
4. **[high][kit] Dialogs are not phone-ready.** `DialogContent` is a centred box with no max height, no inner scroll and no
   phone layout (`components/ui/dialog.tsx:63`), so tall forms (appointment, payment, note, consent) can run off a 360×640
   screen with the action buttons unreachable. *Fix:* below `sm`, a full-screen sheet with a scrolling body and a
   sticky footer. At `sm+`, `max-h-[85dvh]` with an inner scroll. Applies at 360–430 and in landscape phone.
5. **[medium][token] Inactive tab text fails contrast: 4.07:1** (`text-foreground/60` in `components/ui/tabs.tsx`),
   measured by axe on 9 screens. *Fix:* use `ink-muted` (6.1:1).
6. **[medium][kit] Error states have no retry.** 7 inline error messages exist, 0 offer **Try again**. Some lists
   show only a one-liner (`appointment-calendar.tsx:169`). *Fix:* an `ErrorState` kit component (plain-language message +
   Retry calling `refetch`) used by every query view.
7. **[medium][kit] No skeletons** (see 3.6). *Fix:* a `Skeleton` component, plus list, card and chart skeleton presets.
8. **[medium][token] Missing token families:** spacing rhythm names, motion durations and easing, z-index, elevation
   levels, a `warning` triple (distinct from the clinical `alert`), and status borders. *Fix:* as section 3.
9. **[medium][shell] No global patient search or quick actions.** Front desk's top tasks (find a patient, today's
   schedule, check in) each need navigation first. *Fix:* a search field in the shell header (⌘K / Ctrl-K) that
   finds patients by child, guardian or phone, plus a "Today" quick link. All widths, with an icon button on phones.
10. **[medium][shell] Tablet navigation hides everything behind a hamburger** at 768–1023 px (the sidebar starts at 1024).
    *Fix:* an icon rail with labels on hover and focus at `md`, and the full sidebar at `lg`. On phones, a **bottom nav** for the
    four most-used destinations per role, with "More" opening the drawer.
11. **[medium][screen-wide] Deep links are lost.** Patient-record tabs (`patient-record.tsx:27`, `defaultValue`) and calendar
    date and view live in component state, so refresh or back returns to Overview / today. *Fix:* query parameters
    (flagged change 5a).
12. **[low][kit] Truncation rules undefined.** Calendar events truncate names with no tooltip ("Gloria Murp…"),
    and recall rows wrap surnames mid-row. *Fix:* documented rules in DESIGN_SYSTEM.md: never truncate a surname; a
    single-line ellipsis plus `title` and tooltip for names in tight cells; wrap clinical text, never clip it.
13. **[low][kit] Phone numbers and dates break across lines** ("0927 / 533 0269" on Recalls). *Fix:* `whitespace-nowrap`
    for phone, date, money and ID tokens via a shared `Nowrap` / format helper.

## 6. Module findings

### Appointments (`/appointments`, calendar, sheet, form, requests)

- **[high][screen] Day view on phones shows 3 chairs side by side** inside a forced `min-w-[48rem]` scroller
  (`appointment-calendar.tsx`). Chair 3 is off screen and event names are cut off ("Sergio Kuhlma"). 360–430.
  *Fix:* default to an **Agenda** layout under `md`: one card per appointment with time, child, reason and a status chip. Use
  a chair filter instead of columns, and keep the grid at `≥ md`.
- **[high][screen] Week view on phones is 7 columns of fragments** ("Den…", "Dai."). 360–430 and tight at 768.
  *Fix:* under `md`, week = agenda grouped by day. At 768, show 5 working days with Sunday collapsed (the clinic is closed).
- **[high][screen] Month view targets are 16×20 px** (date links) and event pills overflow. 360–768. *Fix:* on phones,
  month shows a dot per day with a count, and tapping a day opens that day's agenda.
- **[high][screen] No-show is one tap, with no confirmation or undo**, and it queues a "missed appointment" SMS to the parent
  (`appointment-sheet.tsx:109`). *Fix:* an undo toast for 8 s, or a confirm step stating the SMS (flagged 5b).
- **[medium][screen] Short appointments render 23 px tall** at 1440 and are hard to hit, with text clipped. *Fix:* a minimum
  event height and a hover/focus popover with full details. Touch users get it on tap, through the existing sheet.
- **[medium][kit] Calendar header labels are 11.7 px** (`.calendar .rbc-calendar { font-size: .8125rem }` plus library
  scaling). All widths. *Fix:* 12 px minimum for headers, 14 px for events.
- **[medium][a11y] react-big-calendar emits invalid ARIA** (`aria-required-parent` / `aria-required-children`,
  critical, in week and month). *Fix:* the list/agenda view becomes the accessible default for screen-reader users,
  with a "Skip calendar grid" link. Patching library roles is out of scope.
- **[low] Date and view aren't in the URL** (cross-cutting 11).

### Patient record (`/patients/[id]` overview + tabs)

- **[medium][screen] Tabs scroll sideways with no affordance.** "Billing" and "Documents" are off screen at 360–430, with
  no fade or arrow. *Fix:* an edge fade plus scroll-into-view of the active tab. Alternatively, at `< sm`, a select
  ("Section: Chart ▾") above the content.
- **[medium][screen] The visit banner uses ~130 px of a 640 px phone screen** above the tabs. *Fix:* compact it to one
  line with the Start-visit button on phones, and keep the full banner at `md+`.
- **[medium][screen] Appointment status chips wrap under the date** in the overview list at 390, giving a ragged column.
  *Fix:* a two-row card layout (date and time / reason with the chip right-aligned).
- **[medium][screen] Tabs not in the URL** (cross-cutting 11).
- **[low][screen] Phone numbers in the header are 17–20 px tall links.** *Fix:* a 44 px hit area on touch.
- Header and alerts: **meets the non-negotiable.** Identity, age, sex, DOB and alerts stay visible at every width.

### Chart tab

- **[high][screen] Tooth targets are too small for chairside touch.** Teeth are roughly 30 px cells, and 60 of 68 targets are under 44 px.
  At 768 (the tablet, gloved use) this risks the wrong tooth, so it's an S3 that borders on S4. *Fix:* 44 px teeth at
  `md–lg`, a larger selected-tooth preview, and the existing "Charting on 55 · upper right second primary molar"
  confirmation made more prominent.
- **[high][screen] The chart is clipped on phones** (`dental-chart.tsx` `min-w-[34rem]` scroller). Quadrants 2 and 3 are off
  screen at 360–430 with no cue. *Fix:* on phones, show one arch at a time (upper/lower toggle) at full width, and keep both
  arches at `≥ md`.
- **[medium][screen] Legend labels pair the name and code tightly** ("Caries C"). *Fix:* a code chip plus label, in two columns.

### Patients list (`/patients`)

- **[medium][screen] Desktop rows: the patient-name link is only 20 px tall.** The whole row needs to be the target, with a
  hover state and Enter on focus. 1024+.
- **[medium][screen] No sibling marker.** The same guardian with several children isn't signalled. This is a clinical
  wrong-patient risk (domain guide). *Fix:* a "Sibling of …" chip on rows and in the header.
- Phone card list: **good**, and it's the model for `DataList`.

### New / edit patient (`/patients/new`, `/patients/[id]/edit`)

- **[high][screen] One long form on phones** (child, guardians, emergency contact, medical, consents), about 2,000 px tall.
  It's easy to lose your place, and errors sit far from the submit button. *Fix:* steps on `< md` (Child → Guardians →
  Medical → Consents → Review) with progress and per-step validation. Keep one page with a section index on desktop.
- **[medium][screen] The sticky action bar can cover the focused input** while the on-screen keyboard is open (sticky footer
  plus keyboard). 360–430, not device-verified. *Fix:* hide the sticky bar while an input has focus on phones, or use
  `scroll-padding-bottom`.
- **[medium][screen] Input semantics:** `tel` and `email` exist (2 each), but there's no `autoComplete` for names
  and addresses and no `inputMode` on the phone fields. *Fix:* add them.
- **[medium][screen] Required fields aren't marked.** The page says "required unless marked optional", which is good, but
  errors only appear on submit. *Fix:* inline validation on blur.

### Billing (`/billing` collections, billing tab, payment dialog, receipt)

- **[medium][screen] Collections rows wrap unpredictably at 390.** Time, name, method, amount and receipt reflow onto 2–3
  lines with amounts at varying x positions. *Fix:* a `DataList` card: name and amount on line 1, time · method · ref on line 2,
  receipt link on line 3.
- **[medium][screen] Refund sits beside Record payment at 32 px** (`billing-tab.tsx:67`). *Fix:* move Refund into a
  "More" menu, or give 8 px of separation with 44 px touch height.
- **[medium][screen] The day picker is a bare native date input.** *Fix:* Today / ‹ › stepper buttons plus the picker,
  matching Appointments.
- Receipt and print: **good**.

### Recalls (`/recall`)

- **[high][screen] Rows collapse badly on phones.** Surnames wrap ("Cummerata, / Noemie") and phone numbers split, with two
  buttons squeezing the text column. 360–430. *Fix:* a card with the name on line 1, due date and phone on line 2, and full-width
  "Send reminder" / "Book" buttons below.
- **[medium][screen] No contact-attempt log or "mark contacted" outcome** (domain recall-queue pattern). *Fix:* flag for
  the roadmap. It's a feature, not styling.
- **[medium][screen] Empty groups ("Due this week (0)") take a full card each.** *Fix:* collapse empty groups into a single
  line.

### Messages (`/messages`, log + templates)

- **[medium][screen] All 63 messages render at once.** The page is 12,400 px tall on a phone. *Fix:* paginate or "Load
  more" (flagged 5c).
- **[medium][screen] Each message card repeats the full SMS body.** *Fix:* clamp to 2 lines with "Show message".
- **[medium][kit] Filter pills wrap to 2 rows on phones.** *Fix:* a horizontally scrollable chip row with a fade.
- **[medium][a11y] Inactive tab contrast** (cross-cutting 5).

### Dashboard (`/dashboard`)

- **[high][screen] Horizontal page scroll on phones**: 569 px at 360 and 539 px at 390. The Collections chart
  renders 896 px wide inside a 324 px card: the Recharts container keeps its desktop width because its grid parent
  lacks `min-w-0`. *Fix:* `min-w-0` on the chart grid items, and confirm on a fresh load at 390.
- **[medium][a11y] `aria-hidden-focus` ×6**: chart internals are focusable inside an `aria-hidden` region. *Fix:* make the
  chart wrapper non-focusable and provide a visually hidden data table as the text alternative.
- **[medium][screen] Small tables overflow at 360** (314 px in 294 px). *Fix:* `DataList`.
- **[low] Revenue labels wrap to 2 lines** ("Prophylaxis (cleaning)"). This is acceptable. Shorten the labels or allow a wider label column at `md`.

### Documents (`/documents`)

- **[low][screen]** The empty state is good. When populated, the log table needs the `DataList` treatment on phones (not
  verified, because the demo has no documents).

### Settings (`/settings`)

- **[medium][screen] Tables overflow inside a scroller on phones** (procedure catalog 413 px in 326–396 px), and the
  4th column is cut off with no cue. *Fix:* `DataList` cards.
- **[medium][a11y] The scroll region isn't keyboard-focusable** (axe `scrollable-region-focusable`). *Fix:* go with the
  DataList (no scroller), or `tabIndex=0` plus a label.
- **[low]** 94% of text is under 16 px at 390. Fixed by cross-cutting 2.

### Login (`/login`)

- **[medium][screen]** "Sign in with email and password" (`<details>`) and inline links are under 44 px. *Fix:* touch tier.
- Otherwise **strong**: brand panel, role cards and loader overlay.

### Parent portal (`/portal/*`)

- **[medium][screen] Section nav scrolls sideways.** "Bills", "Care instructions" and "Uploads" are off screen at 360–430.
  *Fix:* a bottom tab bar with 4 items (Home, Appointments, Bills, More) on phones.
- **[medium][screen] Empty states are plain** ("No bills yet"). *Fix:* brand spot illustrations and a next action
  ("Book a visit" / "Message the clinic").
- **[low][screen] Metadata lines are 14 px.** Raise them to 16 px on phones (the portal is phone-first).
- Copy, targets and child switcher: **good**.

## 7. Plan after approval

1. **Foundation:**
   - **Tokens:** type scale, touch tier, motion, z-index, warning triple, plum and sunny.
   - **Kit:** Button, Input and Select sizes; Tabs contrast; Dialog as a responsive sheet; DataList; Skeleton; ErrorState;
     EmptyState with illustrations; Toast success styling.
   - **Shell:** tablet rail, phone bottom nav, global search.
   - **Docs:** a first DESIGN_SYSTEM.md.
2. **Modules,** in the order of question 4. Each ends with a summary and a breakpoint check (the same sweep, re-run).
3. **Final pass:** a full sweep at all 8 widths, an axe re-run, a re-score against section 4, and DESIGN_SYSTEM.md completed.

**Target for done:** 0 page overflow, 0 serious or critical axe findings outside the calendar library, ≥ 44 px
targets on touch tiers, ≥ 16 px body text on phones, and every data view with a designed phone layout plus empty, loading and
error states.

## 8. Results after the redesign (final pass, 2026-10-03)

This is the same Playwright and axe sweep as section 1, on a fresh production build, at all 8 widths.

| Screen | Page overflow | <44 px targets @390 | <16 px text @390 | <12 px text | axe |
| --- | --- | --- | --- | --- | --- |
| Appointments (day / list) | 0 → 0 | 14 → 2 | 36 → 13 of 50 | 3 → 0 | none |
| Appointments (week) | 0 → 0 | 35 → 2 | 108 → 47* | 7 → 0 | library ARIA only |
| Appointments (month) | 0 → 0 | 64 → 2 | 177 → 47* | 25 → 18** | library ARIA only (contrast fixed) |
| Patient record + tabs | 0 → 0 | 4–16 → 2–7 | 17–71 → 6–26 | 0 | **contrast fixed** (was 10 per tab) |
| Chart tab | 0 → 0 | 60 → 18*** | 87 → 32 | 0 | none |
| Patients / new / edit | 0 → 0 | 5–26 → 3 | 29–86 → 6–14 | 0 | none |
| Billing / receipt | 0 → 0 | 5–12 → 2–10*** | 26 → 6–7 | 0 | none |
| Recalls | 0 → 0 | 21 → 14*** | 24 → 6 of 52 | 0 | none |
| Messages | 0 → 0 | 73 → 29*** | 396 → 32 | 0 | **contrast fixed** |
| Dashboard | **569 → 0** | 28 → 22*** | 130 → 52 | 0 | **aria-hidden-focus fixed** |
| Settings | inner scroll → **none** | 3 → 2 | 82 → 23 | 0 | **scrollable-region fixed** |
| Login / Portal | 0 → 0 | 1–5 → 1–2 | 12–25 → 1–11 | 0 | none |

\* At 390 px, Day and Week render the agenda list. The remaining small text is 12 px labels and chips, which the
type rules allow.
\*\* Month day numbers in the desktop grid. On phones Month isn't offered (the agenda replaces it).
**Superseded 2026-10-03 (legacy-lessons plan 3):** phones now get Month as a count-per-day grid (`month-count-grid.tsx`,
44 px day buttons, one-letter weekday headers with full names for screen readers); tapping a day opens its list. This is
the §6 Month-view fix as first proposed. Closed days are data (`CLOSED_WEEKDAYS`), and a day with appointments is never
shown as closed.
\*\*\* What remains is **inline text links** (patient names, receipt numbers, phone numbers inside a sentence, 19–24
px tall). WCAG 2.5.8 exempts them, and giving them a 44 px hit area would overlap the neighbouring link. Chart teeth
in Mixed mode on a phone are 39×75 px: a tall target, slightly under 44 px wide.

**The dashboard's 569 px overflow only appeared after a desktop-to-phone resize.** A fresh phone load was already
fine. The chart boxes now clip, so a resize or rotation can't scroll the page either.

### Every high-severity finding: resolved

- Touch targets → a `--control-h` touch tier (44 px on touch and under 1024 px).
- 14 px body on phones → `text-sm` is 16 px under 768 px.
- No phone table pattern → `DataList` (Settings, Collections, Dashboard, Documents).
- Dialogs on phones → a full-screen sheet with inner scroll and a sticky footer.
- Calendar day/week/month on phones → an agenda list.
- No-show with no safeguard → a confirm step naming the text it sends.
- Chart teeth and clipping on phones → one side of the mouth at a time, at full size.
- Recall rows on phones → stacked cards with full-width buttons.
- Long intake form on phones → 5 steps with progress and per-step validation.
- Dashboard overflow → fixed.

### Deviations from the approved plan (flagged)

- **5b, No-show undo → confirm step instead.** `no_show` is a final status in `packages/shared/src/domain/appointments.ts`
  (nothing transitions out of it). An undo would change a business rule, which the brief forbids without a flag.
  The confirm step gives the same protection with no rule change.
- **5c, Messages pagination is client-side** (25 at a time, "Show 25 more"). The log is already fetched in full,
  so no API or data-shape change was needed.
- **The tablet rail is 6.5 rem** (not 5.5) so "Appointments" fits as a label.

### Corrections to the audit

- The patient-list desktop rows **were** already fully clickable (a stretched link). That finding was wrong.
- The calendar already opened on List for phones on first load. The audit's day-view screenshot came from a resized
  desktop page. Phones still could not use Day or Week, which is now fixed.

### Deliberately left open

- **react-big-calendar's ARIA structure** in week and month (axe `aria-required-*`, critical, library-internal). The
  agenda list is the accessible path and the default on phones. Patching the library's roles is out of scope.
- **Recall contact-attempt log / "mark contacted" outcome:** a feature, on the roadmap, not styling.
- **Kiosk:** out of scope by decision.
- **Not device-verified:** real iOS and Android keyboards over the sticky form bar (the steps make the form short,
  and the bar is offset above the bottom nav), OS-level large text, and 200% zoom (layouts are fluid and use rem
  throughout, but this was checked by reasoning, not on a device).
