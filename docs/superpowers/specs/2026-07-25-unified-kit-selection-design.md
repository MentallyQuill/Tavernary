# Unified Kit Selection Design

**Status:** Approved

**Date:** 2026-07-25

**Scope:** One project-selection and Kit-membership interaction model across
desktop and mobile catalog cards

## Goal

Tavernary uses the mobile selection-and-commit workflow as the shared model for
adding catalog projects to a Kit. Desktop and mobile differ only in responsive
geometry. They use the same visible card control, state transitions, selection
dock, copy, constraints, and immediate-removal behavior.

The design makes Kit building discoverable without changing the established
meaning of a project card: clicking or tapping the card body always opens the
project's GitHub page.

## Relationship to Existing Kits Designs

This document is a focused amendment to:

- `docs/superpowers/specs/2026-07-24-kits-design.md`
- `docs/superpowers/specs/2026-07-24-kits-mobile-design.md`
- `docs/superpowers/specs/2026-07-24-kits-controls-builder-batch-selection-design.md`
- `docs/superpowers/specs/2026-07-24-kits-motion-interaction-design.md`

It supersedes the following catalog and removal interactions:

- desktop drag-in from project cards;
- catalog project drag handles;
- mobile long press to begin selection;
- whole-card selection mode after selection begins;
- Space or Enter on the card shell as a selection shortcut;
- selection check marks in the upper card corner;
- builder-row `×` removal controls.

Dragging remains available inside the expanded desktop Kit Builder for
reordering projects already in the draft. Mobile retains explicit ordering
controls. All unrelated Kits architecture, data, moderation, publication,
inspection, and submission decisions remain unchanged.

## Interaction Model

Project selection and Kit membership are separate states.

### Selection

Selection is a temporary pile of projects waiting to be added:

1. The user activates a visible orange `+` on a catalog card.
2. Tavernary creates a new transient Kit draft if no editable draft exists.
3. The project enters the pending selection.
4. Its border illuminates mint and its `+` becomes a pushed-in `−`.
5. The shared floating selection dock appears.
6. Additional `+` controls grow the pending selection.
7. Activating a selected card's `−` removes only that pending selection.
8. **Cancel** clears the complete pending selection.
9. **Add to Kit** applies the pending selection atomically to the draft and
   clears the pending selection.

The selection survives scrolling, search changes, filters, and project-category
changes. It clears when the user cancels, applies it, or leaves project browsing
for Kits mode.

### Membership

After **Add to Kit**, each applied project becomes a member of the draft:

- the card uses a persistent orange border;
- the existing **In Kit** badge remains visible;
- the card control remains a pushed-in `−`;
- activating that `−` removes the project from the draft immediately;
- the control returns to `+` and the card returns to its available state.

Builder-row removal performs the same immediate mutation. Removing through a
catalog card updates the builder immediately, and removing through the builder
updates the catalog card immediately.

Removal mutates only the unpublished transient draft. It has no confirmation,
Undo toast, delay, or restoration record. The user can reverse an accidental
removal by activating the `+` and applying the project again.

## Project Card Anatomy

The footer becomes a three-part visual row:

```text
[ + / − ]  [ metadata chips… ]  [ license ]
```

The Kit control is a sibling of the project-card link. It must never be nested
inside the anchor. It visually occupies the footer while preserving separate,
valid link and button semantics.

### Kit control

The control:

- is always visible on every project card;
- occupies the bottom-left corner;
- uses the orange visual language of **Submit Project**;
- has an approximately 26–28 CSS-pixel visible square;
- has at least a 44-by-44 CSS-pixel interactive target on coarse pointers;
- uses a restrained hover lift and a distinct keyboard-focus ring;
- prevents its activation from propagating to the GitHub link.

The available state uses a raised orange `+`. Both pending-selection and
In-Kit states use a pushed-in orange `−`. The surrounding card treatment and
accessible name distinguish the two minus meanings.

Accessible names are project-specific:

- **Add _project_ to Kit**
- **Remove _project_ from selection**
- **Remove _project_ from Kit**

Enter and Space activate the focused Kit button. The card link remains a
separate focus stop that opens GitHub.

### Footer geometry

The card footer reserves space for the Kit control. Metadata chips lose roughly
the width of one short chip and continue using their existing clipping behavior.
The license remains anchored at the bottom-right. The control must not overlap
chips, the license, or the card link at any supported width.

## Visual State Contract

Cards expose four independently testable states:

| State | Border | Kit control | Supporting label |
| --- | --- | --- | --- |
| Available | Existing neutral border | Raised orange `+` | None |
| Pending selection | Mint illuminated outline | Pushed-in orange `−` | Dock count |
| In Kit | Persistent orange border | Pushed-in orange `−` | **In Kit** badge |
| Keyboard focus | Distinct focus ring layered over state | Unchanged | Accessible name |

Color is not the sole carrier of meaning. Glyph, pressed treatment, badge, dock
copy, and accessible labels reinforce the current state.

State changes use the existing short press and border transitions. Under
`prefers-reduced-motion: reduce`, glyph, border, label, and pressed-state
changes remain immediate and clear.

## Shared Floating Selection Dock

Desktop and mobile render the same selection-dock component with responsive
positioning only.

The dock contains:

- **Cancel**
- **Add to Kit**
- a separate selected-count badge
- Frontend-replacement guidance when applicable
- 50-project-capacity guidance when applicable
- a message when the current batch cannot add anything

The primary action's accessible name includes the count, such as
**Add 5 projects to Kit**. Visible copy may remain the compact **Add to Kit**
plus count badge.

On desktop, the dock floats above the bottom edge between the filter rail and
Kit Builder. On mobile, it spans the safe viewport width above the bottom
inset. It must not cover the final catalog card.

**Cancel** is the only bulk-clear action. A lone bulk-minus control is not
added. This keeps individual `−` actions distinct from clearing the pending
selection and avoids implying that the collapsed Kit Builder can empty the
draft.

## Draft and Builder Access

The first `+` creates a new unsaved draft when no editable draft exists, but it
does not open, expand, pulse, or highlight the Kit Builder.

The collapsed desktop rail and mobile draft access preserve their existing
membership reporting:

- immediately after application: **_n_ projects added**
- after the brief added state: **_n_ projects in draft**

The count describes projects already in the draft, not the pending selection.
The floating selection dock owns pending-selection status.

If the first `+` created a draft and the user cancels the only pending
selection, Tavernary discards that draft only when it remains untouched and
empty. A draft with a title, description, or member project remains.

## Builder Removal and Reordering

Every builder-row `×` becomes the same compact minus-box language used on
In-Kit catalog cards. Its accessible name is **Remove _project_ from Kit**.

Desktop keeps contained builder-row dragging for reorder. Catalog cards are not
draggable and do not expose drag handles. Mobile keeps its explicit ordering
controls and does not require touch dragging.

Removing the pinned Frontend is allowed and leaves the draft invalid until the
user selects and applies another Frontend. Existing validation communicates the
missing requirement.

## Constraints and Edge Cases

### Frontend replacement

A pending batch contains at most one Frontend. Selecting another pending
Frontend replaces the earlier pending Frontend. If the draft already contains
a different Frontend, both viewports show the same replacement guidance before
application. **Add to Kit** performs the replacement atomically.

### Capacity

A Kit contains at most 50 projects. When no additional non-Frontend project can
be added:

- unavailable `+` controls are disabled;
- their accessible description explains that the Kit limit is reached;
- selecting a replacement Frontend remains possible because it does not
  increase the project count;
- the dock reports the same capacity guidance on desktop and mobile.

### Existing members

An In-Kit project cannot also enter the pending selection. Its `−` always means
immediate removal from the draft. Removing it does not add it to the pending
selection.

### Unknown or filtered projects

Applying a batch continues to skip unknown, duplicate, or no-longer-eligible
project IDs through the existing batch planner. If application adds nothing,
the selection remains so the user can understand and correct the result.

## Accessibility

Desktop and mobile share the same semantic contract:

- the GitHub card link and Kit button are separate controls;
- pressed `−` controls expose `aria-pressed="true"`;
- button names identify both the project and the action;
- the dock is a labeled region with the current selected count;
- an atomic live region announces selected, deselected, added, removed, limit
  reached, and Frontend-replaced outcomes;
- focus remains on the affected card control after selection or removal when
  that control still exists;
- builder removal moves focus to the next logical row control;
- dismissing the mobile builder returns focus to its opener;
- no behavior requires long press, drag, hover, color recognition, or precise
  pointer timing.

## State Ownership

The existing Kit workspace remains the source of truth for the transient draft.
The batch-selection controller owns only pending project IDs and selection
feedback.

```text
card +/−
   │
   ├── pending selection controller
   │      ├── floating dock
   │      └── atomic Add to Kit
   │
   └── Kit workspace draft
          ├── catalog In-Kit state
          ├── builder rows
          └── rail / mobile draft count
```

The UI must derive card membership from the draft rather than maintain a second
membership copy. An update through any surface therefore renders consistently
everywhere.

## Testing and Verification

Implementation follows strict red-green-refactor TDD.

### Unit and component coverage

- every project card renders an always-visible Kit control;
- the control is a sibling of, not a descendant of, the GitHub link;
- activating the Kit control never opens or activates the link;
- the first `+` starts an untouched transient draft;
- `+` selects and changes to a pressed `−`;
- pending `−` deselects without changing draft membership;
- **Cancel** clears the complete pending selection;
- **Add to Kit** applies once and clears selection;
- In-Kit `−` removes immediately from the draft;
- builder-row `−` performs the same removal;
- card state synchronizes after removal from either surface;
- cancel discards only an untouched empty auto-started draft;
- Frontend replacement and capacity rules remain correct;
- long-press, selection-check, whole-card selection, catalog drag-handle, and
  builder `×` paths are absent.

### Desktop and mobile integration coverage

Run the same behavior sequence at desktop width and at 320, 390, and 430
CSS-pixel widths:

1. activate the first `+`;
2. confirm a draft starts without opening the builder;
3. select multiple projects;
4. deselect one through its `−`;
5. apply the remaining selection through the floating dock;
6. confirm orange In-Kit borders, badges, and synchronized draft count;
7. remove one project through its catalog `−`;
8. remove another through its builder-row `−`;
9. verify the corresponding catalog and builder states after each mutation.

Responsive assertions verify:

- the same copy, order, labels, and state transitions;
- a 44-by-44 CSS-pixel coarse-pointer target;
- no chip, license, or card-link overlap;
- no covered final card or horizontal overflow;
- correct desktop dock bounds between side rails;
- correct mobile dock safe-area placement;
- visible focus at every interactive state;
- correct rendering under reduced motion.

## Out of Scope

- changes to Kit data, moderation, ranking, publication, or submission;
- persistence of unfinished drafts;
- a runtime backend or account system;
- automatically opening or highlighting the Kit Builder;
- bulk removal of every project already in a Kit;
- confirmation dialogs or Undo infrastructure;
- catalog project dragging;
- mobile long press or whole-card selection;
- touch drag reordering.
