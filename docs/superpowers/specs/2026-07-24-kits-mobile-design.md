# Kits Mobile Design

**Status:** Approved

**Date:** 2026-07-24

**Scope:** Mobile and touch behavior for the approved Kits implementation

## Goal

Make Kits browsing, inspection, and editing dependable on phones without
changing the approved static architecture, registry, or publication model.
The experience is browse-first. Editing uses long press and Space batch
selection, direct grab-handle reordering, and corner × removal.

This addendum narrows the shared behavior in
`docs/superpowers/specs/2026-07-24-kits-design.md`. Motion and gesture details
follow
`docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md`.

## Shared Contracts

- Drafts remain transient React memory.
- GitHub issues remain the only submission transport.
- Every create and edit requires manual maintainer approval.
- No runtime API, account, database, `localStorage`, Web Share integration, or
  animation dependency is introduced.
- A valid Kit contains exactly one leading Frontend and two to 49
  non-Frontend projects.
- Shared Kit URLs still select the Kit and open its mobile Kit Builder.

## Mobile Entry and Navigation

At widths up to 760 CSS pixels:

- Selecting **Kits** shows the Kit catalog immediately; the introductory Kit
  Builder does not open automatically.
- The toolbar exposes **Create Kit**.
- Selecting a Kit opens inspection, including explicit unknown-Kit state.
- Closing inspection returns focus to its opener.
- An active build may collapse to a horizontal 44-pixel draft pill showing the
  current count. Closing never discards the draft.

Tablet and desktop retain the in-flow, displacing Kit Builder.

## Whole-Sheet Kit Builder

Phone inspection and building use a full-screen modal sheet because a Kit may
contain 50 projects. The entire sheet moves from the bottom over 220
milliseconds with `cubic-bezier(0.2, 0.8, 0.2, 1)`. It does not fade.

The sheet provides:

- `role="dialog"`, `aria-modal="true"`, and a stable accessible name;
- focus containment, Escape dismissal, and focus return after exit;
- inert background and scroll lock retained through the complete exit;
- `100dvh` sizing and all four safe-area insets;
- a sticky header with a 44-by-44 Close control;
- an independently scrolling body;
- a sticky footer with project count and submission;
- no horizontal overflow at 320, 390, or 430 CSS pixels.

The OS-level `prefers-reduced-motion` preference is respected. There is no
product motion mode or toggle.

## Selecting and Adding Projects

Project cards never expose individual Add buttons. A 450-millisecond long
press on a card body starts selection; movement beyond eight CSS pixels or a
scroll cancels the pending gesture. Space provides the keyboard equivalent.
After selection begins, normal taps toggle additional cards without activating
their links.

The safe-area-aware bottom dock supplies a quiet Cancel action, a minimum
44-pixel **Add to Kit** action, a separate tally, and restrained replacement or
capacity guidance. Only one Frontend can be selected; choosing a second swaps
the first. Existing draft members cannot enter the selection.

Applying performs one atomic background draft update. It does not open the Kit
Builder, move focus or scroll, or change the current search and filters. With
no draft it creates a collapsed draft. The dock then becomes a brief
`N projects added` status and settles to the persistent Kit draft pill with
the cumulative count. Starting another selection temporarily replaces that
pill. There is no undo action.

## Mobile Builder

Title, Description, counters, delayed field errors, composition errors after
submit, and dirty-navigation behavior remain as approved.

### Pinned Frontend

The Frontend is a hyper-compact foundation above the ordered stack. It displays
only its name and corner ×. It is locked first and cannot be reordered. Touch
layouts do not render a Frontend handle.

### Non-Frontend Stack

Every non-Frontend card provides:

- a minimum 44-by-44 grab handle labeled **Drag _project_ to reorder**;
- project name and kind;
- a quiet corner × inside a minimum 44-by-44 target.

Dragging activates after four CSS pixels with no hold delay. The source lifts,
a card-sized physical gap moves through the stack, adjacent cards displace over
150 milliseconds, and the drop settles cleanly without an insertion line,
bounce, pulse, or fade. The direct ghost does not interpolate behind the
finger.

Touch dragging only reorders. Leaving the sheet never arms deletion and there
is no trash bar, sidebar target, or drag-to-delete threshold on touch.

### Removal

The corner × is the primary and only touch removal path. Removal is immediate
and final. There is no Undo timer, confirmation dialog, live remove bar, or
hidden recovery state. Focus moves to the nearest surviving removal control.

Alt+Arrow keyboard reordering remains available when a hardware keyboard is
present.

## Tactile Motion

Motion is modern, clean, practical, and quiet but present:

- 80 milliseconds for press response;
- 120 milliseconds for state changes;
- 150 milliseconds for cards and stack displacement;
- 220 milliseconds for sheets;
- `cubic-bezier(0.2, 0.8, 0.2, 1)` throughout.

Actionable tiles compress to 98 percent while pressed. A changed draft count
may acknowledge once at 102 percent. Builder cards lift only from handle
interaction, never from generic row hover. No spring, bounce, rotation, blur,
or decorative flight is used.

## Mobile Kit Filters

Kit filters use the same whole-sheet movement as project filters:

- visible heading and 44-by-44 Close control;
- focus containment and return after exit;
- inert background through exit;
- frontend, purpose, included-project, size, Pick, count, and clear controls;
- safe-area padding and independent scrolling;
- mode-local open state, so switching modes cannot resurface a stale sheet.

## Inspection, Failure, and Recovery

- Kit card opening, Copy, Report, and disclosure targets meet the 44-pixel
  standard.
- Only one project detail expands at a time.
- Clipboard failure reveals a selectable URL.
- Unknown shared Kits remain explicit.
- Removed or flagged components remain visible in inspection with their reason
  and no invalid external link.
- Closing filters, inspection, or the Kit Builder never changes the catalog
  query.
- Refreshing or navigating away discards the transient draft after the
  approved warning.

## Verification

At 390 by 844, the integrated workflow proves:

1. browse-first entry and Create;
2. scroll cancellation, long press, Space, multi-select, and **Add to Kit**;
3. single-Frontend replacement and cumulative background draft updates;
4. direct handle reorder with a physical gap;
5. dragging beyond the sheet does not remove;
6. corner × removes immediately with no Undo or remove bar;
7. whole-sheet Kit Builder exit retains modal semantics and returns focus.

Additional checks run at 320 and 430 CSS pixels, including 44-pixel targets,
safe areas, sticky regions, a 50-project stack, and horizontal overflow.

Visual baselines cover browse-first Kits, filters, draft pill, empty and
populated Frontend foundations, reorder state, long stack, and inspection.

## Out of Scope

- persistent or synchronized drafts;
- accounts or a runtime backend;
- touch drag-to-delete or a remove bar;
- confirmation or Undo for builder removal;
- an animation library;
- changes to Kit registry, support, ranking, approval, or publication rules.
