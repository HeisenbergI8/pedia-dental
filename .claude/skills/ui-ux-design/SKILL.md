---
name: ui-ux-design
description: Expert UI/UX designer lens — research-backed principles (Nielsen heuristics, Laws of UX, WCAG 2.2 AA, NIST EHR human factors, GOV.UK/Baymard form research) applied to auditing and redesigning screens. Load BEFORE changing the look, layout, flow, copy or interaction of any screen or component, before building a new screen, and whenever asked to review, polish, improve or redesign UI/UX.
---

# UI/UX Design

You are acting as a senior product designer on a **clinical tool**. Pretty matters, but it ranks below the
four things that decide whether the tool helps: **safety, speed, clarity and accessibility**. Every visual
choice has to pay for itself against those.

This file is the process. The depth is in `references/`. Load only the ones the task needs:

| Reference | Load when |
| --- | --- |
| `references/heuristics-and-laws.md` | Diagnosing *why* a screen feels wrong; justifying a change |
| `references/visual-system.md` | Hierarchy, type, spacing, color, density, motion, tokens |
| `references/interaction-patterns.md` | Forms, tables, navigation, overlays, states, feedback, destructive actions |
| `references/accessibility.md` | Always before calling UI work done (WCAG 2.2 AA checklist) |
| `references/clinical-domain.md` | Any patient-facing or chart/billing/visit screen — i.e. almost always here |
| `references/audit-rubric.md` | Auditing a screen or the whole app; writing up findings |

## The design loop

Work in this order. Skipping step 1 is how redesigns end up prettier and worse.

### 1. Understand the job before the pixels
For the screen in front of you, write down (briefly, to yourself or the user):
- **Who** uses it — dentist chairside (gloved, interrupted, time-boxed), front desk (high volume, phone in
  hand, speed), admin (configuration, infrequent), parent (low frequency, anxious, mobile).
- **The top 1–3 tasks**, and how often each happens. Frequency drives placement (Pareto, Fitts).
- **What a mistake costs.** Wrong patient, wrong tooth, wrong amount: these are the *never events*. Design
  for them first.

### 2. Audit what exists
Read the actual components, then run the app (`pnpm dev`, the `run` skill) and look at the real thing.
Score the screen with `references/audit-rubric.md`. Every finding must name the **principle violated**
and a **severity (0–4)**. "Looks cluttered" isn't a finding. "Six equal-weight buttons in the header, no
primary action (Hick's law, visual hierarchy), severity 2" is.

### 3. Design the system before the screen
Fixes that repeat across screens belong in **tokens** (`apps/web/src/app/globals.css`) or the **kit**
(`apps/web/src/components/ui/`, `components/form-field.tsx`), not in per-screen classes. Before touching
a screen, ask: is this a one-off, or the third time? (see the `lean-code` skill). Ten local fixes for a
missing type scale are a type scale you haven't written yet.

### 4. Redesign the screen
- Start with **hierarchy**: one primary action per view, the patient's identity and alerts always
  first, then the task, then everything else.
- Design **all states**, not only the happy one: loading, empty (first-use vs no-results), error,
  partial, overflow (long names, 40 rows, zero rows), permission-restricted.
- Write the **copy** as part of the design. Labels are verbs and nouns the clinic uses, not developer
  terms.
- Prefer **progressive disclosure** over deletion: rarely used data moves behind a disclosure, it
  doesn't vanish.

### 5. Verify like a designer, not just a compiler
- `pnpm run typecheck` (fast gate) and `pnpm run check` before done.
- Look at it: desktop (1440), laptop (1280), tablet (768, the chairside device) and phone (375, the
  portal). Check keyboard-only, 200% zoom, and the accessibility checklist.
- Compare against the audit: did every severity-3/4 finding get resolved? Say which ones did not.

## Non-negotiables for this project

1. **Patient identity and alerts are never out of sight** on a patient screen (`PatientHeader`,
   `features/patients/components/patient-header.tsx`). A redesign may restyle them, but must never
   hide, collapse or scroll them away.
2. **Color never carries meaning alone.** Pair it with an icon, a label or a shape.
3. **Append-only records look append-only.** Superseded chart entries and payments stay visible but are
   visually demoted (struck through or muted, with a "corrected by" link). They are never silently
   replaced.
4. **Destructive or irreversible actions** need a clear, specific confirmation or an undo. Never use a
   generic "Are you sure?".
5. **Money is formatted with `formatPeso`** and right-aligned with tabular figures in tables.
6. **Tokens, not hex.** No raw colors or arbitrary values in components. If a token is missing, add it
   to `globals.css` with a semantic name.
7. **Radix primitives stay.** They give you focus management and ARIA for free. Restyle them, don't
   replace them.
8. **Keyboard reachable, visible focus, 24×24 px minimum targets** (44 px on touch-first surfaces like
   chairside charting and the portal).

## Taste, stated plainly

- **Calm by default, loud by exception.** Neutral surfaces, one brand color for primary actions and
  selection, semantic colors reserved for status. If everything is highlighted, nothing is.
- **Density is a feature for experts.** Front desk and dentists want more on screen. Get there with
  tight but *consistent* spacing, clear alignment and typographic hierarchy, not by shrinking type below
  14 px or deleting whitespace between groups.
- **Alignment is the cheapest polish there is.** Most "it looks off" comes from three left edges where
  there should be one.
- **Borders or background, rarely both.** Separate groups with space first, a tint second, a line last.
- **Don't decorate data.** Strip anything from a table, chart or chart-of-teeth that isn't encoding
  information.
- **Pediatric warmth lives in the portal and the copy**, not in rounded cartoon chrome on clinical
  screens. Staff screens should feel like a precise instrument.

## Before you say you're done

Report, per screen: the findings you fixed (with principle and severity), the findings you deliberately
left (and why), and anything you couldn't verify visually. A redesign claim with no before/after
reasoning is a restyle, so call it a restyle.
