# Kits Motion and Direct-Manipulation Design

**Status:** Pending written review

**Date:** 2026-07-24

**Scope:** Kits motion, builder drag behavior, removal, and the pinned Frontend
foundation on desktop, tablet, and mobile

## Goal

Kits motion must feel modern, clean, crisp, and practical. Animation exists to
clarify interactivity, spatial relationships, state changes, and the result of
direct manipulation. It must never delay input, obscure content, compete with
task completion, or add movement merely for decoration.

Effects remain short, restrained, and reversible. Kits does not use exaggerated
bounce, glow, tilt, ripple, ornamental sequencing, pointer trails, or looping
animation.

## Relationship to the Approved Kits Designs

This document is a focused amendment to:

- `docs/superpowers/specs/2026-07-24-kits-design.md`
- `docs/superpowers/specs/2026-07-24-kits-mobile-design.md`

It supersedes only the interaction contracts listed below:

- A Kit requires exactly one Frontend rather than one or more Frontends.
- The Frontend is pinned at index zero and is not part of the reorderable
  project stack.
- Builder rows use grab handles and corner removal controls rather than visible
  Move up, Move down, and Remove text buttons.
- Mobile and tablet handles reorder; mobile and tablet removal uses the corner
  removal control.
- Desktop handles reorder and can remove a card by dragging it outside the
  editor.
- Removal is immediate and final within the transient draft. There is no Undo
  action, timer, restoration record, or removal toast.

All unrelated Kits decisions remain approved and unchanged, including the
static architecture, browse-first phone entry, transient in-memory drafts,
GitHub issue submission, manual approval, registry rules, workspace
accessibility, Kit filtering, and publication model.

## Implementation Direction

V1 uses the lean native approach:

- CSS transitions for hover, press, state, and panel movement;
- the existing pointer controller, extended for geometry and drag state;
- direct transforms for the drag ghost;
- native layout measurements for physical-gap displacement;
- no Motion, Framer Motion, GSAP, spring, or other animation dependency.

JavaScript owns interaction truth. CSS owns visual interpolation. A visual
transition must never become the source of domain state.

## Motion Foundation

Kits defines a small local motion vocabulary:

| Purpose | Duration | Use |
| --- | ---: | --- |
| Press | 80 ms | Button and card press feedback |
| State | 120 ms | Border, background, danger, and label changes |
| Card | 150 ms | Lift, reorder displacement, settling, and gap closure |
| Panel | 220 ms | Mobile sheet and desktop workspace movement |

The standard easing curve is a restrained deceleration:

```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

The dragged ghost is the exception. It follows the pointer directly and never
uses easing, smoothing, or delayed interpolation.

## Catalog and Inspection Surfaces

### Published Kit cards

Published Kit cards are selectable, not draggable.

On a fine pointer, hover or keyboard focus:

- raises the card by 2 CSS pixels;
- strengthens the border;
- strengthens the existing shadow;
- completes in 150 milliseconds.

On touch, press compresses the card very slightly for 80 milliseconds and
releases. There is no sticky hover simulation.

### Project cards

Project cards retain the same restrained 2-pixel hover/focus lift. While a
draft is active:

- **Add to Kit** compresses on press;
- the button changes to **Added** through a 150-millisecond local state
  transition;
- the draft count performs one restrained 2–3 percent scale acknowledgement;
- no card copy flies through the viewport.

When the draft already contains a Frontend, every other Frontend project uses
**Use instead** rather than **Add to Kit**.

Filtering and sorting replace the result grid immediately. Kits does not
animate many catalog cards into new grid positions.

### Inspection rows and utility controls

Inspection rows respond through border and background changes rather than
elevation. Filter controls, disclosure rows, Copy, Report, Close, and other
utility actions use the shared press timing without decorative movement.

## Exactly One Frontend

Every valid Kit contains exactly one Frontend and between two and 49
non-Frontend projects, for the existing total of three to 50 unique projects.

Draft and published component order is normalized:

1. the Frontend at index zero;
2. the ordered extension and preset stack.

Adding or importing a second Frontend never creates a two-Frontend draft.

### Frontend foundation slot

The editor contains a compact **Frontend** section above the reorderable stack.
The slot is always present and has two states:

- empty: **Choose one Frontend**;
- populated: a 44–48 CSS-pixel-high foundation row.

The populated row contains only the Frontend name, the controls available for
the current input layout, and the semantics required to identify it as the
Kit's fixed foundation. It uses a restrained Frontend accent rather than a
full danger surface.

The Frontend row:

- remains pinned above the project stack;
- never participates in stack reordering;
- never creates a reorder gap;
- remains compact on desktop, tablet, and mobile;
- does not display project metadata that belongs in inspection.

### Adding and replacing

With an empty slot:

- Add or drag installs the selected Frontend at index zero;
- the slot expands cleanly to its populated height.

With a populated slot:

- another Frontend project exposes **Use instead**;
- activating **Use instead** directly replaces the Frontend;
- dragging another Frontend over the slot highlights only that slot;
- the slot says **Release to replace _current frontend_**;
- dropping directly replaces the Frontend;
- no confirmation dialog or Undo step follows an explicitly labeled
  replacement.

Replacement updates the compact row without moving or replaying animation on
the non-Frontend stack.

### Removing

On desktop, the compact row includes a functional handle labeled
**Drag to remove _Frontend_** and a quiet corner removal control. The handle
does not reorder the Frontend; it can only begin the desktop drag-off removal
gesture.

On tablet and mobile, the nonfunctional handle is omitted. The compact row
contains the Frontend name and the corner removal control.

Removing the Frontend leaves the empty foundation slot in place. The draft
becomes invalid until another Frontend is chosen.

## Builder Card Anatomy

Every non-Frontend builder card contains:

- a grab handle;
- project name and kind;
- a quiet corner removal control.

The corner control uses a small `×` glyph but a minimum 44-by-44 CSS-pixel hit
area. It is always present at low contrast, strengthens with a restrained
danger tint on hover or focus, and compresses briefly on activation. Its
accessible name is **Remove _project_**.

There are no visible Move up, Move down, or Remove text buttons.

## Drag and Reorder State Machine

### Idle and handle intent

Ordinary builder-card hover changes only the border and background. The card
lifts only while its grab handle is hovered or focused. This teaches the real
drag origin without implying that the entire row is draggable.

### Pressed and activation

Pointer-down gives the handle immediate pressed feedback. Drag activates after
4 CSS pixels of pointer movement, with no hold delay.

A press that does not cross the threshold:

- does not create a ghost;
- does not displace rows;
- does not change order;
- leaves keyboard focus on the handle.

### Active reorder

At activation:

- the controller captures the pointer;
- a fixed-size ghost preserves the source card's measured width and height;
- the ghost follows the pointer directly;
- the source position becomes a clean, card-sized empty gap.

Within the stack:

- crossing another card's midpoint changes the intended destination;
- neighboring cards translate over 150 milliseconds to create a physical gap;
- no insertion line, destination glow, or post-drop pulse is shown;
- top and bottom edge proximity autoscrolls the stack;
- all measurements are recomputed after scroll movement.

Releasing inside the valid stack commits the order and settles the card into
the existing gap over 150 milliseconds. There is no bounce, overshoot, spring,
or acknowledgement highlight.

### Cancellation

Escape, pointer cancellation, lost pointer capture, unmount, or an invalid
drop:

- preserves the original order;
- clears autoscroll;
- removes the ghost;
- restores displaced rows;
- returns the source card cleanly to its original gap.

Cleanup is deterministic and idempotent.

### Keyboard reorder

The handle remains keyboard focusable. Alt+Arrow Up and Alt+Arrow Down reorder
non-Frontend cards through the same immutable ordering path and 150-millisecond
layout displacement.

Focus remains on the moved card's handle after reordering. The pinned Frontend
handle does not expose reorder shortcuts.

## Removal

Removal mutates the transient draft immediately and finally. It does not create
an Undo record.

### Corner removal

The corner `×` is the primary removal path on touch layouts and the explicit
alternative on desktop.

After activation:

- the removed card disappears without an exit flourish;
- remaining cards close the gap over approximately 150 milliseconds;
- focus moves to the next card's removal control, or the previous card's
  removal control when the last card was removed;
- an empty stack moves focus to the Frontend slot or the next logical builder
  control.

### Desktop drag-off removal

Desktop permits drag-off removal for both non-Frontend cards and the pinned
Frontend.

While the handle/pointer remains inside the editor, dragging is
non-destructive. When it leaves the editor boundary:

- the ghost changes over 120 milliseconds to a restrained danger border and
  background;
- **Release to remove** appears on the ghost;
- returning inside cancels the danger state immediately;
- releasing outside removes the card.

The handle/pointer position—not the first card edge or card center—determines
the boundary state.

### Touch removal

Tablet and mobile handles reorder non-Frontend cards only. They do not arm
drag-off removal. The pinned Frontend does not render a handle on touch
layouts.

Touch layouts do not add a persistent or transient remove bar. The corner `×`
is the sole removal path.

## Workspace and Sheet Movement

### Mobile

The full mobile builder and filter sheets move as physical surfaces:

- open by sliding upward from below the bottom edge over 220 milliseconds;
- close by sliding back below the bottom edge;
- do not fade;
- carry their safe-area padding with the moving surface.

Background content becomes inert immediately. Focus enters when the surface
mounts and returns after the close transition completes. Input, scrolling,
Escape, and close controls remain functional throughout.

The draft pill moves from and returns toward the bottom edge.

### Desktop

Desktop uses an in-flow three-column layout:

```text
filters | catalog cards | Kit workspace
```

Opening the workspace expands its grid track from the 48-pixel collapsed rail
to the existing 280–340-pixel workspace width. The catalog track contracts by
the same amount and its cards reflow within the remaining space.

The workspace:

- never overlays catalog cards;
- remains clipped to its own grid area;
- never hides a draggable project behind the editor;
- contracts back to the 48-pixel rail when collapsed.

If a project drag begins during the 220-millisecond layout transition, the
workspace snaps to its final open geometry before the drag controller measures
targets.

Switching between inspection and editing inside an already-open workspace is
immediate and does not replay the entrance movement.

### Tablet

Tablet retains the approved overlay workspace because the viewport cannot
support three usable in-flow columns. It uses the same touch interaction rules
as mobile.

## Interruption and Responsiveness

Motion never blocks functionality. A new input can interrupt or reverse an
active transition. Domain changes occur on activation or drop, not after a
decorative timeout.

Hover effects are limited to:

```css
@media (hover: hover) and (pointer: fine)
```

Pointer movement is sampled through `requestAnimationFrame`. Drag geometry is
read in controlled batches, and direct ghost transforms are written separately
to avoid repeated layout thrashing. `will-change` is applied only during active
interaction.

## System Reduced-Motion Preference

Tavernary does not add a motion mode, animation setting, or toggle.

When the device or browser exposes `prefers-reduced-motion: reduce`, Kits
removes spatial translation, scale, smooth displacement, and sheet travel.
Immediate border, color, text, focus, and danger feedback remains. The standard
experience continues to use every practical animation in this design.

## Testing and Verification

Implementation follows strict red-green-refactor TDD.

### Unit and component contracts

- exactly one Frontend is valid; zero or two Frontends is invalid;
- adding or dragging a second Frontend replaces rather than appends;
- Frontend order is normalized to index zero;
- the Frontend row is compact and never reorderable;
- touch Frontend rows omit the handle;
- non-Frontend handles expose Alt+Arrow keyboard reorder;
- corner controls expose stable accessible removal names;
- there are no Move up, Move down, Remove text, or Undo controls;
- the 4-pixel activation threshold separates press from drag;
- cancel paths preserve the original order;
- drag state distinguishes reorder, replace, and desktop remove.

### Integrated pointer and touch contracts

At desktop width:

- Kit and project cards use the approved lift;
- the workspace displaces rather than covers the catalog;
- every visible catalog project remains draggable;
- drag activation creates a source-sized ghost and physical gap;
- row midpoint crossing moves the gap;
- edge autoscroll retains correct placement;
- drop settles without a line, pulse, or bounce;
- leaving the editor arms **Release to remove**;
- re-entering cancels removal;
- releasing outside removes;
- a Frontend drag targets the pinned slot and replaces an existing Frontend.

At 320, 390, and 430 CSS-pixel widths:

- the entire workspace slides from the bottom without fading;
- non-Frontend handles reorder;
- no drag gesture removes;
- every corner `×` is at least 44 by 44 CSS pixels;
- the pinned Frontend is compact and has no handle;
- replacement through **Use instead** works;
- the 50-project stack remains scrollable and reorderable.

### Motion and accessibility contracts

- state is exposed through stable attributes or classes rather than inferred
  from transition timing;
- tests assert final geometry and explicit state transitions, not exact
  intermediate animation frames;
- focus follows keyboard reorder and corner removal;
- system reduced-motion preference removes spatial motion without removing
  state feedback;
- animation never introduces horizontal overflow;
- visual baselines contain no covered cards, stale ghost, insertion line,
  remove bar, or oversized destructive treatment.

## Out of Scope

- an animation library;
- spring physics;
- persistent animation preferences;
- touch drag-off removal;
- a mobile remove target or remove bar;
- Undo;
- animated filtering or sorting;
- changes to Kit support, ranking, moderation, registry, or publication
  policy;
- persistent drafts or a runtime backend.
