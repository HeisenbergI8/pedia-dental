# Motion: the animation principles, translated for interfaces

Load this before adding, changing or reviewing any animation or transition. The short rules in
`visual-system.md` (durations, easing, animate `opacity` and `transform` only, reduced motion) still
hold; this file is the depth behind them.

Motion in a product has three jobs: **orient** (where did this come from, where did it go), **give
feedback** (the press registered, the save worked) and **show a relationship** (this panel belongs to
that row). A movement that does none of those is decoration, and decoration on a work screen is a cost.

## First decide whether it should move at all

**Frequency of use sets the budget.** The more often someone triggers something, the less it should
animate.

| How often | Motion budget | Examples |
| --- | --- | --- |
| Dozens of times a day | None, or a near-instant state change (under 100 ms) | Command menu, keyboard shortcuts, row selection, tab switches, opening a dropdown with the keyboard |
| A few times a day | Short and plain (150 to 200 ms), no flourish | Opening a side panel, expanding a section, a toast |
| Rarely, or once | Room for character | First-run onboarding, an empty state, a completed checkout, an achievement |

A delightful 400 ms animation becomes friction by its fiftieth view. Anything triggered from the
keyboard should feel instant; the person has already moved on.

**Respect `prefers-reduced-motion`.** Under it, replace movement with a fade or an instant change. Never
remove the feedback itself, only the travel.

## The twelve principles, for UI

These come from Disney animation. Each is stated as what it means on a screen, where it earns its place,
and where it does not.

| Principle | On a screen | Use it for | Avoid it for |
| --- | --- | --- | --- |
| **Squash and stretch** | A small scale change on impact or press (for example 0.97 on press, back to 1 on release) gives an element weight | Buttons, toggles, a card dropped into place | Text and data; never distort type or numbers |
| **Anticipation** | A tiny wind-up before a large move (a slight dip before a sheet rises, an icon pulling back before it flies) so the eye sees it coming | Large or surprising movements the user did not directly cause | Anything the user just clicked; their click *is* the anticipation |
| **Staging** | Direct attention to one thing at a time: the moving element is the focus, everything else holds still or dims | Dialogs, a newly added row, the one changed value | Several things animating at once; if two elements move, neither is the focus |
| **Pose to pose** | Define the start and end states and let CSS transitions or the browser interpolate between them | Nearly everything in UI: transition between two clean states | Hand-tuned frame-by-frame sequences in product screens |
| **Follow through and overlapping action** | Parts keep moving slightly after the main body stops, then settle (a drawer that overshoots by a few pixels; list items arriving a few ms apart) | Panels, drawers, lists entering | Overshoot on anything precise, like a value, a chart axis or a cursor position |
| **Slow in and slow out** | Ease, never linear. Ease-out for things entering (fast start, gentle stop), ease-in for things leaving | Every movement | Linear timing, except for continuous loops like a progress bar or spinner |
| **Arcs** | Things that travel far move along a slight curve, not a straight line | An item flying to a cart, a shared-element transition between views | Short moves (a few pixels), where a curve is invisible and just costs effort |
| **Secondary action** | A small supporting motion that backs up the main one (a checkmark drawing in as a button turns green) | Confirming success, adding character to a rare moment | Anything that competes with or delays the main feedback |
| **Timing** | Duration sets the feel. Keep UI motion under 300 ms; micro feedback 100 to 150 ms; overlays entering 200 to 250 ms; exits faster than entrances | All of it | Making the user wait for an animation to finish before they can act |
| **Exaggeration** | Push slightly past realistic so the moment registers (a shake on a wrong password, a bounce on a success) | Error and success moments that must be noticed | Routine actions; exaggeration everywhere is noise |
| **Solid drawing** | Give flat elements depth and volume with consistent light: shadows grow as things lift, layers stack in a believable order | Elevation of menus, dialogs, dragged items | Mixing light directions or elevation rules between components |
| **Appeal** | The sum of every detail above, done with care and consistency | The whole product | Spending polish on decoration instead of the moments people actually look at |

## Making it feel fast

- **Respond within 400 ms (Doherty threshold).** If the work takes longer, animate the *response*
  immediately (pressed state, skeleton, optimistic update) and let the result arrive after.
- **Never block input on an animation.** The user can click the next thing while the last one is still
  settling.
- **Interruptible beats complete.** A transition that is reversed mid-way (the user closes a panel while
  it is opening) should reverse from where it is, not finish and then restart.

## Hit areas

The clickable area can be bigger than what you see. A small icon button can keep its visual size while
its hit target is padded out (padding, or a transparent pseudo-element positioned around it) to the
minimum in `SKILL.md` (24 px, 44 px on touch). This is Fitts's law applied without changing the look.
Make sure padded targets do not overlap their neighbours.

## Checklist before shipping an animation

1. Which job does it do: orient, feedback or relationship? If none, remove it.
2. How often will it be seen? Does its length fit the frequency budget?
3. Under 300 ms, eased, `opacity` and `transform` only?
4. Does it still work, and still give feedback, under `prefers-reduced-motion`?
5. Can the user act before it finishes, and can it be interrupted?
6. Is only one thing asking for attention at that moment?

Sources: the twelve principles from Frank Thomas and Ollie Johnston, *The Illusion of Life*; Raphael
Salaja's userinterface.wiki; Jon Yablonski's *Laws of UX*; the frequency-of-use rule from Emil Kowalski.
