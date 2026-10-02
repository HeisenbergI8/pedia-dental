# Accessibility — WCAG 2.2 AA, made concrete

Target **WCAG 2.2 Level AA**. Accessibility isn't a separate pass; it's most of what "usable under
stress" means. A dentist with gloves on, a front-desk clerk on the phone and a parent on a cracked phone
in sunlight are all accessibility cases.

## The checklist (run before calling UI work done)

### Perceivable
- [ ] Text contrast **≥4.5:1**; large text (≥18.66 px bold or ≥24 px) **≥3:1** (1.4.3).
- [ ] UI component boundaries, icons that convey meaning and focus indicators **≥3:1** against neighbors
      (1.4.11).
- [ ] **Color is never the only signal** (1.4.1): status badges have text, required/error states have
      text and an icon, chart conditions have a pattern or label.
- [ ] Content reflows at **320 px wide / 400% zoom** with no two-dimensional scrolling (1.4.10). Data
      tables and the tooth chart may scroll horizontally inside their container.
- [ ] Text spacing can be increased without clipping (1.4.12). Avoid fixed heights on text containers.
- [ ] Images and meaningful icons have text alternatives; decorative icons get `aria-hidden`.
- [ ] Structure is semantic: one `h1` per page, heading levels not skipped, lists as lists, tables as
      `<table>` with `<th scope>`.

### Operable
- [ ] Everything works with the **keyboard alone**, with no traps (2.1.1, 2.1.2).
- [ ] **Visible focus** on every interactive element (2.4.7). Use `focus-visible:ring-2 ring-ring
      ring-offset-2`, and never `outline-none` without a replacement.
- [ ] **Focus not obscured** (2.4.11, new in 2.2): sticky headers, footers and toasts must not cover the
      focused element. Add `scroll-padding-top` equal to the sticky header height.
- [ ] Focus order matches the visual order (2.4.3).
- [ ] **Target size ≥24×24 CSS px** or enough spacing (2.5.8, new in 2.2). The project rule is **44×44**
      for touch-first surfaces (chairside chart, portal). Icon buttons in table rows are the usual
      offenders.
- [ ] **Dragging has a single-pointer alternative** (2.5.7, new in 2.2): calendar drag-to-reschedule
      needs a "Move to…" action as well.
- [ ] Skip link to main content; landmarks (`header`, `nav`, `main`).
- [ ] Page titles are unique and descriptive (2.4.2): "Ana Cruz · Chart · Pedia Dental".
- [ ] Link and button text makes sense out of context. No bare "Click here" or "View".
- [ ] No time limits on forms, or they can be extended.

### Understandable
- [ ] Every input has a programmatic label (1.3.1, 3.3.2). `FormField` does this, so use it.
- [ ] Errors are identified in text and described with how to fix them (3.3.1, 3.3.3), and are linked via
      `aria-describedby` with `aria-invalid`.
- [ ] Legal and financial submissions are reversible, checked or confirmed (3.3.4): payments,
      consents and voids.
- [ ] **Redundant entry** (3.3.7, new in 2.2): don't make users retype guardian, address or patient info
      already known in the flow. Prefill it or offer it.
- [ ] **Consistent help** (3.2.6, new in 2.2): help and contact links sit in the same place on every
      page, which matters most in the portal.
- [ ] Consistent navigation and identification: the same icon and label mean the same thing everywhere
      (3.2.3, 3.2.4).
- [ ] No context change on focus or input alone (3.2.1, 3.2.2): a select must not navigate.
- [ ] **Accessible authentication** (3.3.8): when real auth arrives, allow paste and password managers,
      and use no cognitive puzzles.

### Robust
- [ ] Custom widgets expose name, role and value (4.1.2). **Radix provides this, so keep using its
      primitives** and don't rebuild menus, dialogs or tabs from divs.
- [ ] Status messages are announced without moving focus (4.1.3): toasts (sonner uses a live region),
      "Saved", and result counts after filtering use `role="status"` / `aria-live="polite"`.

## Patterns that need special care here

- **Tooth chart.** An SVG or grid of buttons. Each tooth is a focusable button with an accessible name
  ("Tooth 55, upper right second primary molar, caries on occlusal surface"). Use arrow-key navigation
  (roving tabindex) and a visible selection distinct from focus. Conditions are encoded by color *and*
  glyph or pattern. Provide a list or table view equivalent of the chart.
- **Allergy and alert banner.** Use `role="alert"` only when it appears dynamically. On page load it
  should be a clearly labeled region (`aria-label="Medical alerts"`), not a shout on every navigation.
- **Calendar.** react-big-calendar has weak a11y. Provide a list or agenda view, and make appointment
  blocks real buttons with full names ("9:30–10:00, Ana Cruz, cleaning, Dr. Reyes").
- **Charts (growth, dashboard).** Use a text summary or data table alternative, and never rely on color
  alone for series.
- **Dialogs and sheets.** Focus moves in on open and returns to the trigger on close; the title is
  `DialogTitle`; `Esc` closes. Radix does this as long as you don't fight it.
- **Icon-only buttons** need `aria-label` and a tooltip.
- **Reduced motion:** wrap non-essential animation in `motion-safe:`.

## How to verify

- Keyboard pass: unplug the mouse and complete the screen's top task.
- Zoom pass: 200% and 400% browser zoom, and a 320 px viewport.
- Contrast: compute it for every token pair actually used (text on ground, muted on white, badge fg on
  badge bg). Write the ratios down when you change tokens.
- Screen reader smoke test (VoiceOver: `⌘F5`) for headings, landmarks, form labels and error
  announcements.
- Automated checks catch ~30–40% of issues at best. Treat them as a floor, not proof.
