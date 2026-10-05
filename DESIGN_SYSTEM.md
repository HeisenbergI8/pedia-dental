# Primoral design system

The rules for how the Primoral clinic app looks and behaves. Tokens live in
`apps/web/src/app/globals.css`, components in `apps/web/src/components/`. **Change the system there, never in
a screen.** UI_AUDIT.md records why each rule exists.

**Personality:** warm, playful, gentle, trustworthy, clean.
**Look:** calm, precise, elevated ("Option C refined", 2026-10-04). Plum brand, teal secondary, warm-grey ground.
**Never:** anything cold or hospital-like, and no cartoon chrome on staff screens.
**Dark mode:** Light, Dark or System, chosen per device in the account menu. See §2a.

## 1. Where warmth goes

| Surface | Tone |
| --- | --- |
| Staff screens (dashboard, calendar, chart, billing, lists) | A calm, precise instrument: warm-grey ground, white cards, one brand colour (plum), status colour only for status, Bricolage titles. **No crayon chrome**: the strip is gone from the staff shell. The one rich moment is the dashboard's brand-deep greeting banner. |
| Login, parent portal, success moments, copy | Warm: Fredoka (`font-display`) for the login hero and portal greeting, the crayon strip, the hand-drawn badge (`EmptyState tone="warm"`), friendly words |

## 2. Colour

Every text pair below passes WCAG AA in both themes. Contrast is asserted by `apps/web/src/design/design-tokens.test.ts`;
a new text or chart token adds its pair there.

| Role | Token | Notes |
| --- | --- | --- |
| Primary | `brand` #5b3fa8 | Plum (the logo's purple "i", deepened). Primary buttons, links, focus, the active nav icon. 7.7:1 on white. |
| Brand tint | `brand-subtle`, `brand-ring`, `brand-tint-ink` | Confirmed tiles and chips, the visit-in-progress banner, calendar today. Text on the tint is `brand-tint-ink` (12.8:1). |
| Brand deep | `brand-deep`, `brand-glow`, `on-deep*` | The dashboard banner and identity avatars. `on-deep*` text is constant in both themes. |
| Secondary | `second`, `second-bg` | The logo's teal. Requests from parents, the "new" chart series. **Never status.** |
| Warm surface | `sunny` | Birthdays, celebrations, the warm empty state. Never status. |
| Ground / surface | `ground`, `surface`, `surface-raised` | Warm-grey page, white cards, things above cards |
| Neutral fills | `selected`, `track` | `selected`: the active nav item, menu and hover highlight (never a brand tint). `track`: the Segmented track. |
| Text | `ink`, `ink-muted` | Muted is 5.6:1 on ground. Don't go lighter. |
| Lines | `line`, `line-soft`, `line-strong`, `control-border`, `input-border` | `line` card hairlines (and the default for a bare `border`), `line-soft` dividers inside a card. **`control-border` is never a field edge**: it is for labelled controls (secondary buttons). Fields use `input-border` (3.5:1, WCAG 1.4.11). |
| Overlay | `scrim` | Behind dialogs and sheets, never `bg-black`. |
| **Status** (fg / bg / line) | `success*`, `info*`, `warning*`, `danger*` | Status only, always with an icon and a word |
| **Clinical alert** | `alert*` | Allergies, conditions and patient alerts **only** |
| Logo | `logo`, `logo-smile`, `logo-ink` | The Primoral logo, loader and brand strip only. |
| Crayons | `crayon-*` | Illustrations and warm tints. **Decoration only.** |
| Charts | `chart-bar`, `chart-returning` + `chart-new` | `chart-bar` (= brand) for one series. Returning = plum, new = teal; the pair passed the dataviz validator in both themes (2026-10-04) and must differ in lightness by ≥ 1.3:1 (tested). A new series needs a validated token, light and dark. |

**Do:** show arrived as `warning` (someone is waiting) and "Not billed" as `warning` with an icon.
**Don't:** use `alert` for anything that isn't clinical, or orange crayon for status. That's alarm fatigue.

## 2a. Dark mode

- **All or nothing.** Every screen, dialog, sheet, toast, chart, table and the calendar goes dark together. A screen
  that can't go dark is a bug, not an exception.
- **Tokens only.** Dark redefines the same tokens under `:root[data-theme="dark"]` in `globals.css`. A component never
  picks a dark colour itself. `dark:` utilities follow the app's choice (not the OS) and never apply in print.
- **Paper stays white.** Printing always uses the light palette (the dark block is `@media screen`), so receipts print
  white. PDFs draw their own colours and are always white.
- **The logo follows the theme through its own tokens.** `PrimoralLogo` and `PrimoralMark` (components/brand.tsx) are
  inline SVG coloured by `logo`, `logo-smile` and `logo-ink`; dark lifts the P and lightens the name. No plate.
- **Constant tokens** (`paper`, `photo-backdrop`) are the same in both themes. Use them only for artwork and photos.
- **Teeth stay white** with their conventional fills in both themes.
- **Measured pairs (2026-10-04):** ink 14.6:1 on surface, ink-muted 7.0:1 on surface-raised, brand 7.8:1 on surface,
  brand-ink on brand 8.0:1, input border 4.4:1. Every pair is re-measured by `design-tokens.test.ts`.
- **The banner is constant-dark** (`brand-deep`) and edged with an inset hairline, because its fill is close to the dark
  ground.
- **Charts:** spread `TOOLTIP` from `features/dashboard/components/charts.tsx`. Recharts' default tooltip is white.

## 3. Type

- **Bricolage Grotesque** (`font-title`, 600) for page and card titles and big numbers. `h1` and `h2` get it
  automatically. **Fredoka** (`font-display`) only for the login hero, the portal greeting and warm empty states.
  **Figtree** for everything else.
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 (Tailwind `xs` to `4xl`).
- **Phones read at 16 px.** Under 768 px, `text-sm` *is* 16 px (a token override), so no screen needs mobile
  type of its own. Labels (`text-xs`) stay at 12 px. Nothing goes below 12 px.
- `tabular-nums` on money, times, counts and tooth numbers. Money is always `formatPeso` and right-aligned.
- Wrapping:
  - **Never truncate a surname** (patient identification).
  - Phone numbers, dates, money and IDs don't wrap (`whitespace-nowrap`).
  - Clinical text wraps and is never clipped.
  - Long SMS bodies clamp to 2 lines with "Show message".

## 4. Space, shape, elevation

- 4 px base. Group gaps are smaller than section gaps (Tailwind 1–16).
- Radius: 12 px base (`--radius`). Buttons 10 px (`rounded-md`), cards 18 px (`rounded-2xl`), the dashboard banner 22 px
  (`rounded-3xl`). Pills (`rounded-full`) for chips and the child switcher.
- Elevation, three levels: flat (page) → `shadow-card` / `shadow-raised` → `shadow-overlay` (dialogs, sheets).
  Buttons add `shadow-xs` (secondary) and `shadow-button` (primary: top highlight and a soft brand lift).
- **No dashed outlines.** An empty box is a hairline card with a muted line.
- **Motif:** the brand strip (`.brand-strip`, plum into the smile's teal) tops the login and portal only. The hand-drawn badge (`border-2
  border-crayon-outline bg-sunny shadow-crayon`) appears only in `EmptyState tone="warm"` and success moments.

## 5. Touch and controls

- `--control-h` is **36 px with a mouse on desktop, and 44 px on touch screens and anything under 1024 px**.
  Button, Input, Select, Tabs and menu items read it, so every control is thumb-sized where it matters without
  a per-screen class.
- Small controls (checkboxes) get a 44 px invisible hit area via `.touch-hit`.
- At least 8 px between adjacent buttons. The primary action comes last, and the rarer or money-out action is
  quieter (Refund is a ghost button).
- **Buttons:** primary = solid brand with highlight and lift. Secondary (`outline`) = white with a hairline, never an
  ink edge. Ghost = text. `strong` = solid ink, for final but not destructive actions (sign out). Destructive = red, for
  data loss only.

## 6. Motion

- `--duration-fast` 120 ms (hover, press), `--duration-base` 200 ms (overlays), `--duration-slow` 320 ms.
  Easing tokens: `--ease-enter` and `--ease-exit`.
- Buttons press down 1 px. Skeletons pulse. Under `prefers-reduced-motion`, everything stands still,
  including the logo loader.

## 7. Layers (z-index)

`--z-sticky` 20 (patient header, form bars) · `--z-header` 40 (top bar, bottom nav) · `--z-overlay` 50
(dialogs, sheets) · `--z-toast` 60.

## 8. Components

| Component | Use it for | Rules |
| --- | --- | --- |
| **AppShell** | Staff app | Phones: top bar plus **bottom nav** (4 + More). Tablets: **icon rail** with labels. Desktop: full sidebar. Patient search everywhere (⌘K / Ctrl-K). Current page = neutral `selected` pill + brand icon + bold label (no side bar, no tint); on the phone tab bar, a 3 px brand bar on the top edge. |
| **PortalShell** | Parent portal | Phones: bottom tab bar (Home, Appointments, Bills, More), same current-tab marker as the staff app. md+: section tabs with a brand underline. Keeps the crayon strip. |
| **PatientSearch** | Finding a child | Two identifiers per result (name + age and DOB) and alerts, so the wrong child isn't opened |
| **PatientHeader** | Every patient screen | Always visible: identity, alerts, **sibling chip**. Never collapse or hide it. |
| **DataList** | Any table | A table from md up; cards below md (`title`, `trailing`, `meta`, `detail` slots). `bare` inside a card. |
| **Dialog** | Forms and confirmations | Full-screen sheet on phones, 85dvh capped at sm+, inner scroll, **sticky footer**. `size="confirm"` for a short question: a bottom sheet with a handle on phones, a small card from sm. |
| **Segmented** | One choice of a few (calendar view, dentition, side of the mouth, grouping, photo layout) | A `track` with a white pill on the chosen option; buttons with `aria-pressed` in a labelled group. Never tabs (nothing is a tabpanel). |
| **Loading** | Content inside an open page | A skeleton shaped like the content, fading in after 150 ms. `compact` is one line. |
| **PageLoading / LoadingScreen** | Page changes / app start and sign-in | The animated Primoral mark (the P bobs, the smile draws itself) |
| **ErrorState** | Any failed query | Plain words for what failed, plus **Try again** (refetch). `compact` for cards. |
| **EmptyState** | First use and no results | What's missing and the next step. `tone="quiet"` (staff, default): a brand-tint icon tile and a Bricolage title. `tone="warm"` (portal, success): the hand-drawn badge and Fredoka. |
| **StatusChip** | Appointment status | Icon + word + tone. Never colour alone. Confirmed = brand tint + ring. Calendar tiles lead with the same status icon. |
| **FlagChip** (patient list) | Computed patient labels | Icon + word. Recall due = `info`, Balance due and No contact = `warning`. Never `alert`. Driven by `domain/patient-list.ts` rules, never set by hand. |
| **Toast** | Saved, failed, queued | Status colours (`richColors`). Top centre, so it never covers a dialog, sheet or bottom-nav action (Part B). |

## 9. Patterns

- **Destructive or final actions** get a specific confirm that names the consequence ("This can't be undone,
  and it sends Aliya Lynch a 'missed appointment' text"). Cancel needs a reason.
- **Where you are** lives in the URL: patient tab (`?tab=chart`), calendar (`?date=…&view=…&status=…`) and the patient
  list (`?q=&filter=&sort=&page=`). Refresh, back and shared links land in the same place.
- **Long forms on phones are steps** (patient intake: 5 steps with progress). Next validates only that step,
  nothing typed is lost, and a submit error jumps to its step. Desktop shows one page.
- **Calendar on phones:** Day and Week are agenda lists; Month is a count-per-day grid (tap a day for its list).
  The time grid is for tablet and desktop. A day with appointments is never shown as closed (`isClosedDay`).
- **Dental chart on phones shows one side of the mouth** at a time, so teeth stay full-size targets.
- **Patient record sections on phones** are a grouped "Section" picker (Record / Clinical / Admin); tabs from `sm` up.
- **Sideways-scrolling strips** that remain (message and patient-list filters, record tabs on a narrow tablet) fade at
  the edge (`.scroll-fade-x`).
- **Every list, table, chart and form** has designed loading, empty and error states.

## 10. Checklist for a new screen

- [ ] Tokens only. No hex, no `text-[13px]`.
- [ ] No `border-dashed`, no tinted selection (selection is `selected`), one-of-N toggles use `Segmented`.
- [ ] `pnpm run check -- design` passes.
- [ ] Checked in dark at 375 / 768 / 1280: no white panel, invisible text or invisible border.
- [ ] One primary action. Patient identity and alerts visible if it's a patient screen.
- [ ] A phone layout on purpose (DataList, agenda, steps), with no page-level sideways scroll at 360 px.
- [ ] Loading (skeleton), empty (EmptyState) and error (ErrorState with retry) states.
- [ ] Status uses an icon and a word, and clinical `alert` only for clinical facts.
- [ ] Keyboard-reachable with visible focus. 44 px targets on touch. 16 px text on phones.
