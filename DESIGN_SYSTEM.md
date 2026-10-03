# Kidsmile design system

The rules for how the Kidsmile clinic app looks and behaves. Tokens live in
`apps/web/src/app/globals.css`, components in `apps/web/src/components/`. **Change the system there, never in
a screen.** UI_AUDIT.md records why each rule exists.

**Personality:** warm, playful, gentle, trustworthy, clean.
**Never:** anything cold or hospital-like, and no cartoon chrome on staff screens.
**Dark mode:** not supported, by decision (bright clinic rooms, print-on-white documents, logo drawn for white).
The tokens are semantic, so it can be added later.

## 1. Where warmth goes

| Surface | Tone |
| --- | --- |
| Staff data screens (calendar, chart, billing, lists) | A calm, precise instrument: neutral surfaces, one brand colour, status colour only for status |
| Login, parent portal, empty states, success moments, copy | Warm: Fredoka headings, crayon accents, the hand-drawn badge, friendly words |

## 2. Colour

Every text pair below passes WCAG AA, measured.

| Role | Token | Notes |
| --- | --- | --- |
| Primary | `brand` #17686e | The logo teal, deepened. Buttons, links, selection. 6.5:1 on white. |
| Primary tints | `brand-subtle`, `brand-soft` | Selected rows and nav / decorative fills only, never text |
| Secondary | `plum`, `plum-bg` | The logo's purple. Secondary emphasis, never status. |
| Warm surface | `sunny` | Empty-state badges and celebrations. Never status. |
| Ground / surface | `ground`, `surface`, `surface-raised` | Page, cards, things above cards |
| Text | `ink`, `ink-muted` | Muted is 6.1:1 on ground. Don't go lighter. |
| Lines | `line`, `line-strong`, `input-border` | Input borders are 3.3:1 (WCAG 1.4.11) |
| **Status** (fg / bg / line) | `success*`, `info*`, `warning*`, `danger*` | Status only, always with an icon and a word |
| **Clinical alert** | `alert*` | Allergies, conditions and patient alerts **only** |
| Crayons | `crayon-*` | Logo, loader, brand strip, illustrations. **Decoration only.** |

**Do:** show arrived as `warning` (someone is waiting) and "Not billed" as `warning` with an icon.
**Don't:** use `alert` for anything that isn't clinical, or orange crayon for status. That's alarm fatigue.

## 3. Type

- **Fredoka** (`font-display`, 500/600) for page and card titles, the portal greeting and empty-state titles.
  `h1` and `h2` get it automatically. **Figtree** for everything else.
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
- Radius: 10 px base (`--radius`). Pills (`rounded-full`) for chips, segmented controls and the child switcher.
- Elevation, three levels: flat (page) → `shadow-card` / `shadow-raised` → `shadow-overlay` (dialogs, sheets).
- **Motif:** the crayon strip (`.brand-strip`) tops every shell. The hand-drawn badge (`border-2
  border-crayon-outline bg-sunny shadow-crayon`) appears only in EmptyState and success moments.

## 5. Touch and controls

- `--control-h` is **36 px with a mouse on desktop, and 44 px on touch screens and anything under 1024 px**.
  Button, Input, Select, Tabs and menu items read it, so every control is thumb-sized where it matters without
  a per-screen class.
- Small controls (checkboxes) get a 44 px invisible hit area via `.touch-hit`.
- At least 8 px between adjacent buttons. The primary action comes last, and the rarer or money-out action is
  quieter (Refund is a ghost button).

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
| **AppShell** | Staff app | Phones: top bar plus **bottom nav** (4 + More). Tablets: **icon rail** with labels. Desktop: full sidebar. Patient search everywhere (⌘K / Ctrl-K). |
| **PortalShell** | Parent portal | Phones: bottom tab bar (Home, Appointments, Bills, More). md+: section tabs. |
| **PatientSearch** | Finding a child | Two identifiers per result (name + age and DOB) and alerts, so the wrong child isn't opened |
| **PatientHeader** | Every patient screen | Always visible: identity, alerts, **sibling chip**. Never collapse or hide it. |
| **DataList** | Any table | A table from md up; cards below md (`title`, `trailing`, `meta`, `detail` slots). `bare` inside a card. |
| **Dialog** | Forms and confirmations | Full-screen sheet on phones, 85dvh capped at sm+, inner scroll, **sticky footer** |
| **Loading** | Content inside an open page | A skeleton shaped like the content, fading in after 150 ms. `compact` is one line. |
| **PageLoading / LoadingScreen** | Page changes / app start and sign-in | The animated Kidsmile logo |
| **ErrorState** | Any failed query | Plain words for what failed, plus **Try again** (refetch). `compact` for cards. |
| **EmptyState** | First use and no results | The hand-drawn badge, a Fredoka title, what's missing, and the next step |
| **StatusChip** | Appointment status | Icon + word + tone. Never colour alone. |
| **Toast** | Saved, failed, queued | Status colours (`richColors`). Sits above the phone bottom nav. |

## 9. Patterns

- **Destructive or final actions** get a specific confirm that names the consequence ("This can't be undone,
  and it sends Aliya Lynch a 'missed appointment' text"). Cancel needs a reason.
- **Where you are** lives in the URL: patient tab (`?tab=chart`) and calendar (`?date=…&view=…`). Refresh,
  back and shared links land in the same place.
- **Long forms on phones are steps** (patient intake: 5 steps with progress). Next validates only that step,
  nothing typed is lost, and a submit error jumps to its step. Desktop shows one page.
- **Calendar on phones is an agenda list.** The grid is for tablet and desktop.
- **Dental chart on phones shows one side of the mouth** at a time, so teeth stay full-size targets.
- **Sideways-scrolling strips** (record tabs, message filters) fade at the edge (`.scroll-fade-x`).
- **Every list, table, chart and form** has designed loading, empty and error states.

## 10. Checklist for a new screen

- [ ] Tokens only. No hex, no `text-[13px]`.
- [ ] One primary action. Patient identity and alerts visible if it's a patient screen.
- [ ] A phone layout on purpose (DataList, agenda, steps), with no page-level sideways scroll at 360 px.
- [ ] Loading (skeleton), empty (EmptyState) and error (ErrorState with retry) states.
- [ ] Status uses an icon and a word, and clinical `alert` only for clinical facts.
- [ ] Keyboard-reachable with visible focus. 44 px targets on touch. 16 px text on phones.
