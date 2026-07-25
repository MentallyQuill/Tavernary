# Kits Mobile Design

**Status:** Approved direction, awaiting written-spec review

**Date:** 2026-07-24

**Scope:** Mobile and touch behavior for the approved Kits implementation

## Goal

Make Kits browsing, inspection, and editing dependable on phones without
changing the approved desktop workspace, static architecture, registry, or
publication model.

The mobile experience is browse-first. Editing is tap-first. Pointer dragging
remains a desktop enhancement and is never required on a touch layout.

## Relationship to the Kits Design

This document is a focused mobile addendum to
`docs/superpowers/specs/2026-07-24-kits-design.md`.

It narrows two shared behaviors for mobile:

- Entering Kits mode opens the workspace by default on desktop, but not on
  mobile.
- Fine-pointer desktop layouts retain drag handles. Mobile, tablet, and other
  coarse-pointer layouts use explicit tap controls instead.

All other approved Kits contracts remain unchanged. In particular:

- drafts remain transient React memory;
- GitHub issues remain the only submission transport;
- every create and edit requires manual maintainer approval;
- no runtime API, account, database, `localStorage`, or Web Share integration
  is introduced;
- shared Kit URLs still select the Kit and open its mobile workspace.

## Considered Interaction Models

### Selected: Tap-first editing

Projects are added with **Add to Kit**. Builder rows expose large **Move up**,
**Move down**, and **Remove** controls. Removal offers **Undo**. A compact draft
pill returns the user to an active draft.

This is the selected model because it is discoverable, works with assistive
technology, does not conflict with page scrolling, and remains usable for
three-project through 50-project stacks.

### Rejected for V1: Long-press touch dragging

A hold threshold could reduce accidental drags, but it remains hard to
discover, conflicts with scrolling and platform gestures, and makes precise
placement difficult in long lists. It may be reconsidered only as an optional
enhancement after the tap-first path is proven.

### Rejected: Drag-to-bin or drag-to-sidebar

A trash target or side drop zone consumes scarce viewport space, hides a
destructive operation behind a gesture, and does not improve ordering. Removal
must stay explicit and recoverable.

## Mobile Entry and Navigation

At widths up to 760 CSS pixels:

- Selecting **Kits** shows the Kit card catalog immediately.
- The empty introductory workspace does not open automatically.
- The toolbar includes a visible **Create Kit** action.
- Selecting a Kit opens its inspection workspace.
- A shared URL containing a valid Kit ID opens the selected Kit workspace.
- A shared URL containing an unknown Kit ID opens the not-found workspace.
- Closing inspection returns focus to the invoking Kit card.
- Tapping the selected Kit card again reopens inspection.

Desktop retains the persistent open workspace. Tablet retains its overlay
workspace but uses the touch editing controls defined below.

## Mobile Workspace

The mobile workspace remains a full-screen modal surface because inspection
and editing can contain up to 50 ordered projects.

It must provide:

- `role="dialog"` and `aria-modal="true"`;
- a stable accessible name;
- focus containment and Escape dismissal;
- focus return to the invoking card, Create action, or draft pill;
- background regions made inert while open;
- `100dvh` sizing;
- padding using `env(safe-area-inset-top)`,
  `env(safe-area-inset-right)`, `env(safe-area-inset-bottom)`, and
  `env(safe-area-inset-left)`;
- a sticky header containing the workspace title and a 44-by-44 CSS-pixel
  Close control;
- an independently scrolling content region;
- a sticky builder footer containing project count, validation summary, and
  the submission action.

Closing the workspace never discards a draft.

## Draft Pill

The desktop collapsed edge control remains unchanged.

On mobile and tablet, an active build draft collapses to a horizontal fixed
pill above the bottom safe area:

```text
Draft · 3 projects
```

The pill:

- is at least 44 CSS pixels high;
- never uses vertical writing;
- does not cover toolbar controls;
- includes the current project count;
- opens the builder when tapped;
- receives focus after the builder is closed;
- remains available while browsing project cards;
- is not shown for an introductory or closed inspection workspace.

An inspected Kit is reopened from its card rather than through a persistent
mobile launcher.

## Adding Projects

While a draft is active, every eligible project card exposes an **Add to Kit**
button with a minimum 44 CSS-pixel hit area.

After a successful addition:

- the draft pill count updates immediately;
- the button changes to a non-destructive **Added** state;
- duplicate taps do not add another copy;
- the underlying card link remains usable;
- no workspace is forced open.

The user can add several projects from the catalog and then return to the
builder through the draft pill.

## Mobile Builder

The builder keeps the approved title, description, and ordered project stack.

### Fields

- Title and Description use stable explicit labels.
- Character and word counters use `aria-describedby`; they do not become part
  of the changing accessible name.
- Empty-form validation is not shown immediately.
- A field-level error appears after the field has been touched.
- Composition errors appear after the first submit attempt and update as the
  stack changes.
- Inputs remain visible when the software keyboard is open.

### Ordered project rows

Touch layouts do not render a drag handle. Each row includes:

- project name and kind;
- a minimum 44-by-44 **Move up** control;
- a minimum 44-by-44 **Move down** control;
- a minimum 44 CSS-pixel-high **Remove** control.

Unavailable moves are disabled but remain understandable through their
accessible names. Reordering preserves the current scroll position and moves
focus with the activated control.

Fine-pointer desktop layouts retain pointer drag, its ghost, placement
preview, Escape cancellation, and edge autoscroll.

### Removal and Undo

Removing a project updates the draft immediately and presents an assertive but
concise status:

```text
Removed Memory Tool. Undo
```

The Undo action:

- is at least 44 CSS pixels high;
- restores the project at its previous index;
- remains available for six seconds;
- is replaced by a later removal;
- is announced through a live region;
- is not persisted after the builder unmounts.

There is no drag-to-delete target and no destructive confirmation dialog.

## Kit Cards and Inspection

The one-column Kit card layout remains.

- The main card-opening target remains large.
- Copy and Report controls must each meet the 44 CSS-pixel hit-area standard.
- Inspection actions wrap into full-width or two-column tap targets without
  clipping.
- Project disclosure rows are at least 44 CSS pixels high.
- Only one project detail is expanded at a time.
- The inspection header and Close control remain visible while a long stack
  scrolls.

## Mobile Kit Filters

Kit filters use the same proven modal-sheet structure as project filters
instead of applying the hidden desktop `.filter-panel` class.

The sheet provides:

- a visible heading and 44-by-44 Close control;
- focus containment and return to the filter toolbar button;
- inert background regions and body scroll lock;
- frontend, purpose, included-project, size, and Pick controls;
- active-filter count and clear action;
- safe-area padding and independent vertical scrolling.

Closing the sheet clears only its open state. Switching catalog modes cannot
resurface a stale filter sheet from the previous mode.

## Touch Targets and Layout

Every interactive control introduced or restyled by this pass has a minimum
44-by-44 CSS-pixel hit area, except full-width text controls whose height is at
least 44 CSS pixels.

The implementation must have:

- no horizontal page or modal overflow at 320, 390, and 430 CSS-pixel widths;
- no card content hidden behind the draft pill;
- no fixed control beneath the browser safe area;
- no dependency on hover;
- visible keyboard focus;
- reduced-motion behavior consistent with the existing site.

## Failure and Recovery Behavior

- Clipboard failure continues to reveal a selectable URL.
- An unknown shared Kit remains an explicit not-found workspace.
- A removed or flagged component remains visible in inspection with its
  unavailable reason and without an external link.
- Closing filters, inspection, or the builder never changes catalog query
  state.
- Closing the builder never discards the transient draft.
- Refreshing or navigating away still discards the transient draft, subject to
  the approved dirty-navigation warning.

## Testing

Implementation follows strict red-green-refactor TDD.

### Unit and component proof

- Mobile entry does not render an introductory dialog.
- Shared and explicitly selected Kits do render the dialog.
- Create opens the builder and establishes focus.
- Stable labels and described counters are exposed.
- Touch rows omit drag handles and expose explicit order controls.
- Remove and six-second Undo restore the original index.
- The draft pill reports the current count and reopens the builder.
- Modal background regions become inert and are restored on dismissal.

### Integrated mobile proof

At 390 by 844:

- Kits opens directly to cards.
- Create, inspect, close, and focus-return paths work.
- Kit filters are visible, usable, dismissible, and mode-local.
- Three projects can be added without forcing the workspace open.
- The draft pill updates from zero through three projects.
- Reorder and Undo work without drag.
- Every relevant control has a minimum 44 CSS-pixel hit area.
- A 50-project builder keeps its sticky header and footer usable.
- The page and every modal have no horizontal overflow.

Run an additional narrow-width check at 320 CSS pixels and a safe-area style
check at 430 CSS pixels.

### Visual baselines

Capture and inspect:

- browse-first Kit catalog;
- open Kit filters;
- active draft pill over project browsing;
- populated three-project builder;
- long-stack builder after scrolling;
- selected Kit inspection with wrapped actions.

No baseline is accepted with clipped controls, vertical launcher text, hidden
content, undersized tap targets, or unexpected horizontal overflow.

## Out of Scope

- persistent local drafts;
- accounts or synchronized drafts;
- touch drag-and-drop;
- drag-to-delete;
- a runtime backend;
- changes to desktop drag behavior;
- changes to Kit registry, support, ranking, approval, or publication rules.
