# Kits Controls, Builder, and Batch Selection Design

**Date:** 2026-07-24  
**Status:** Approved design; awaiting written-spec review  
**Scope:** Tavernary Kits UI refinement for controls, the Kit Builder, and
project-to-Kit selection

## Relationship to the Existing Kits Design

This document refines and, where explicitly stated, supersedes the Kits UI
details in:

- `2026-07-24-kits-design.md`;
- `2026-07-24-kits-mobile-design.md`; and
- `2026-07-24-kits-motion-interaction-design.md`.

The Kits data model, publication workflow, one-Frontend rule, ordering model,
desktop drag-and-drop behavior, mobile full-screen builder, and approved
practical motion baseline remain intact unless this document says otherwise.

The term **Kit Workspace** is retired from the product UI. The replacement term
is **Kit Builder**.

## Problem

The first Kits implementation is functionally complete but several controls
look and behave like browser defaults instead of Tavernary controls:

- Kit Size is rendered as two separate one-thumb sliders even though the
  approved design requires one two-thumb range;
- the Kits sort control does not consistently share the project sort geometry;
- Clear Kit Filters, Create new Kit, and several Kit Builder actions bypass
  Tavernary's established control hierarchy;
- the collapsed desktop Kit Builder uses narrow, rotated text and the wrong
  collapse icon;
- every project tile gains an Add to Kit button while a draft is active,
  creating visual clutter; and
- adding projects one at a time does not support efficient batch assembly
  across searches and filters.

## Goals

1. Make Kits controls look native to Tavernary.
2. Replace the two Kit Size sliders with one accessible dual-thumb control.
3. Rename Kit Workspace to Kit Builder throughout the product surface.
4. Replace the rotated collapsed rail with the supplied Kits icon, a readable
   label, and a persistent draft tally.
5. Remove per-project Add to Kit buttons.
6. Preserve desktop handle-based drag-and-drop.
7. Add a non-interruptive long-press batch-selection path for pointer users and
   a Space-key equivalent for keyboard users.
8. Let users repeatedly select, add, search, filter, and add again without the
   Kit Builder opening or stealing focus.
9. Keep all controls practical, modern, crisp, and restrained rather than
   decorative or over-animated.

## Non-Goals

- Replacing desktop drag-and-drop.
- Adding undo behavior.
- Introducing an animation library.
- Building a general-purpose site-wide React component library.
- Making selection durable across reloads or navigation away from All
  Projects.
- Allowing one batch to target multiple Kits.
- Changing Kit publication, validation, or trending semantics.

## Visual-System Approach

Use a focused set of shared Tavernary control treatments rather than Kits-only
copies or a full application-wide component rewrite.

The shared treatments are:

1. **Primary action:** filled heritage orange, matching Submit Project.
2. **Secondary action:** bordered raised surface for ordinary reversible
   actions.
3. **Quiet action:** unfilled text action for Clear all, Clear Kit Filters,
   withdrawal, and similarly low-emphasis actions.
4. **Icon action:** compact square treatment used by density, filter, panel,
   and similar icon controls.
5. **Select control:** the existing project-sort height, padding, border,
   radius, typography, focus ring, and dark surface.
6. **Text and numeric fields:** the established filter or builder surface,
   border, radius, typography, placeholder, and focus treatment.

These may be implemented as shared CSS classes and small focused components.
They must not require converting unrelated application controls.

### Required Mappings

| Kits control | Tavernary treatment |
| --- | --- |
| Create Kit / Create new Kit | Primary action |
| Add to Kit | Primary action with count badge |
| Submit Kit | Primary action |
| Duplicate / Edit / Copy link | Secondary action |
| Report Kit / Request withdrawal | Quiet action |
| Clear Kit Filters | Quiet action matching Clear all |
| Kits sort | Shared select treatment matching project sort |
| Kit Builder collapse/expand | Icon action using the Kits glyph |

No control in this scope may fall back to an unstyled native button, select, or
number field.

## Kit Size Dual-Thumb Range

### Visual Contract

Kit Size is one horizontal track covering the inclusive range from 3 through
50 projects.

- One thumb controls the minimum.
- One thumb controls the maximum.
- The segment between the thumbs uses `--color-kind-preset`.
- The excluded track uses `--color-border`.
- Compact readouts above the track show `Min <value>` and `Max <value>`.
- The readouts are labels, not exposed browser-default number inputs.
- Desktop thumbs remain visually compact.
- Coarse-pointer hit areas are at least 44 by 44 CSS pixels.

### Interaction Contract

- Values are integers.
- The thumbs cannot cross.
- Left/Right and Down/Up change the focused value by one.
- Page Down/Page Up change it by five.
- Home/End move the focused thumb to its valid boundary.
- Pointer movement updates the URL-backed Kit query through the existing query
  update path.
- Clearing Kit filters restores 3–50.

### Accessibility Contract

The two thumbs remain distinct range inputs in the accessibility tree even
though they share one visual track.

- The group is named `Kit size`.
- The controls are named `Minimum projects` and `Maximum projects`.
- Each exposes the current numeric value and valid constrained boundary.
- A combined visually hidden status reports the selected range.
- Focus-visible uses Tavernary's mint focus treatment.

## Kit Builder

### Naming

Replace user-facing and accessibility-facing instances of Kit Workspace with
Kit Builder:

- `KIT BUILDER`;
- `Open Kit Builder`;
- `Close Kit Builder`;
- `Collapse Kit Builder`; and
- `Expand Kit Builder`.

Internal implementation names may be migrated in place where doing so improves
clarity. Pre-alpha compatibility aliases are not required.

### Supplied Icon

Use the user-supplied `kits.svg` as the source for the Kit Builder panel glyph.
The production asset must:

- preserve the supplied path geometry;
- use `currentColor` rather than a fixed black fill;
- omit generator comments and fixed 800-pixel dimensions;
- remain an inline, themeable SVG; and
- have an accessible label supplied by its containing control rather than by
  the decorative SVG itself.

The original orientation points left and means expand the right-side rail. A
horizontal flip points right and means collapse the expanded right-side panel.

### Expanded Desktop and Tablet Panel

- The Kit Builder remains a right-side layout track.
- Opening it displaces the project or Kit grid; it never covers unreachable
  cards.
- The panel uses the established surface, divider, spacing, headings, and form
  controls.
- The header reads `KIT BUILDER`.
- The header collapse control uses the horizontally flipped Kits icon.
- Create new Kit uses the primary orange action.
- Inspect and edit actions use the control hierarchy defined above.
- Project rows retain their approved grab handles, compact pinned Frontend,
  remove controls, gap reordering, drag-removal threshold, and clean-settle
  motion.

### Collapsed Desktop and Tablet Rail

The collapsed rail is approximately 72 pixels wide and remains a real layout
track.

- It contains the unflipped Kits icon.
- `Kit Builder` appears below the icon as centered, horizontal, two-line text.
- There is no vertical writing mode or rotated label.
- The complete rail is one large button.
- When a draft exists, the bottom area shows its cumulative project count.
- The accessible name includes that count, for example:
  `Open Kit Builder, 7 projects in draft`.

Immediately after a batch addition, the bottom status briefly reports
`3 projects added`, then settles to `7 projects in draft`.

### Mobile Builder

Mobile keeps the approved full-screen Kit Builder sheet.

- It uses a normal close control, not the desktop collapsed rail.
- It retains focus containment, focus restoration, safe-area handling, and
  touch-safe targets.
- The floating draft pill is its collapsed access point.

## Project Batch Selection

### Preserved Desktop Drag Path

Desktop handle-based drag-and-drop remains available whenever an editable Kit
draft is active.

- Pointer-down on the grab handle begins the existing drag path.
- The handle is not a long-press selection target.
- Dragging one project into the Frontend slot or project stack retains the
  approved target validation and replacement behavior.
- Removing Add to Kit buttons does not remove or weaken the grab handle.

### Entry and Toggle Behavior

Batch selection is available in All Projects on desktop, tablet, and mobile.

#### Pointer

- Holding the card body for 450 milliseconds enters selection mode and selects
  that project.
- Moving more than 8 CSS pixels before activation cancels the hold.
- Pointer-up, pointer-cancel, scrolling, unmounting, or beginning a handle drag
  also cancels the timer.
- The implementation requests a short vibration through `navigator.vibrate`
  when supported. Failure or lack of support is silent.
- After selection mode begins, a normal tap or click toggles subsequent cards.

#### Keyboard

- Space on a focused project enters selection mode and toggles that project.
- Enter retains normal project navigation while selection mode is inactive.
- While selection mode is active, Enter or Space toggles the focused card
  rather than navigating away.
- Escape clears the complete selection and exits selection mode.

#### Normal Navigation

When selection mode is inactive, an ordinary click or tap continues to open the
project's canonical destination. A completed long press must suppress the
follow-up synthetic click so it cannot both select and navigate.

### Selected Appearance

- Selected cards receive a two-pixel mint outline and raised surface treatment.
- A compact check indicator appears in the upper corner without covering card
  metadata.
- The selection treatment is distinct from keyboard focus and from a project
  already present in the draft.
- `aria-selected` or an equivalent explicit selection state is exposed through
  a suitable selectable-card container.

### Selection Persistence

Selection persists across:

- scrolling;
- sorting;
- density changes;
- search changes; and
- project-filter changes.

The floating action always shows the complete tally, including selections
temporarily hidden by the current query.

Selection clears when:

- the projects are added;
- the user presses Cancel;
- the user presses Escape;
- the user switches to Kits; or
- the user navigates away from the catalog.

Selection is transient UI state and is not serialized into the URL or browser
storage.

## One-Frontend and Capacity Rules

### Frontend Selection

Only one Frontend may be selected in a batch.

- Selecting a second Frontend swaps it for the previously selected Frontend.
- When the draft already has a different Frontend, the action dock reports:
  `Frontend will replace <name>`.
- Applying the batch replaces the draft Frontend through the existing
  one-Frontend domain helper.

### Existing Draft Members

- Projects already in the draft do not enter the batch selection.
- They do not increase the selection tally.
- Applying a batch deduplicates defensively even though the selection UI
  excludes known members.
- The card may expose a quiet `In Kit` state, but not an Add button.

### Fifty-Project Limit

The batch may contain only as many net-new projects as the draft can accept.

- A new draft has capacity for 50.
- A 47-project draft has capacity for three net-new projects.
- Replacing a Frontend does not consume an additional slot.
- Attempting to select beyond capacity leaves that card unselected.
- The action dock reports `Kit limit reached · 50 projects`.

Capacity is derived from the canonical prospective draft after deduplication
and Frontend replacement, not from a naive sum.

## Floating Selection and Draft Access

### Selection Dock

Selection mode displays one floating dock aligned to the project-grid content,
not to the full browser width.

- The dock reserves enough page-bottom space that it cannot cover the final
  project card.
- It contains a quiet Cancel action.
- Its primary action reads `Add to Kit`.
- A distinct badge shows the current selection count.
- Replacement or capacity guidance appears as restrained secondary text.
- The primary action is enabled only when at least one addable project is
  selected.

On mobile the dock is safe-area-aware and uses at least 44-pixel targets.

### Apply Behavior

Pressing Add to Kit performs one atomic draft update:

1. If no draft exists, create a new draft in the collapsed state.
2. Otherwise, retain the current builder state.
3. Deduplicate already-present projects.
4. Apply the single Frontend replacement rule.
5. Append the other selected projects in their selection order.
6. Clear selection mode.
7. Preserve the current scroll position, search, filters, sort, density, and
   focused browsing context.

The action must not:

- open the Kit Builder;
- expand a collapsed Kit Builder;
- scroll to the Kit Builder;
- move keyboard focus to the Kit Builder;
- show an undo control; or
- navigate away from All Projects.

If the Kit Builder is already open, it remains open and updates in place. If it
is collapsed, it remains collapsed.

### Desktop and Tablet Draft Indicator

After applying a batch, the selection dock closes. The collapsed Kit Builder
rail supplies persistent draft visibility and access.

- Its transient message reports the net number added.
- Its settled message reports the cumulative draft count.
- Activating the rail opens the Kit Builder.

If the Kit Builder is already expanded, its visible project count updates and
the same concise addition status is announced without stealing focus.

### Mobile Transforming Dock

Mobile uses one bottom floating surface rather than a separate toast and draft
pill.

- During selection it is the Add to Kit dock.
- After applying or cancelling, it becomes or restores the neutral draft pill.
- The draft pill contains the Kits icon, `Kit draft`, and the cumulative project
  count.
- Immediately after an addition it briefly reports the net number added, then
  settles to the cumulative count.
- Activating the pill opens the full-screen Kit Builder.
- Starting another selection temporarily replaces the pill with the selection
  dock.

## Feedback and Motion

Feedback is quiet but present.

- Selected-card outline and check state appear immediately after activation.
- The selection dock enters with a short opacity and vertical-position
  transition.
- Draft-count updates use a short clean text/status transition.
- The dock-to-pill change is a restrained state change, not a spring, bounce,
  or celebratory animation.
- Normal durations stay in the existing practical motion range, approximately
  120–180 milliseconds.
- The transient `N projects added` visual status remains long enough to read,
  then settles to the cumulative draft count.
- An `aria-live="polite"` status announces both net additions and the cumulative
  total, for example: `3 projects added. 7 projects in draft.`

The accessibility preference for reduced motion is honored through the
standard media query; this is not a user-facing Tavernary animation mode.

## Component and State Boundaries

The implementation should use focused units with these responsibilities:

### `DualRange`

- renders the shared visual track and two accessible range inputs;
- clamps values without crossing; and
- reports an ordered `[minimum, maximum]` pair.

### `useProjectBatchSelection`

- owns transient selected project IDs and their selection order;
- owns the long-press timer and movement threshold;
- excludes existing draft members;
- applies Frontend swapping and capacity checks for selection eligibility; and
- clears on the approved exit conditions.

### `ProjectSelectionDock`

- renders Cancel, Add to Kit, tally, replacement guidance, and capacity status;
- reserves page-bottom space while present; and
- delegates one atomic apply action.

### `KitDraftAccess`

- renders the collapsed desktop/tablet rail draft status or mobile draft pill;
- renders transient net-added status and settled cumulative status; and
- opens the Kit Builder on activation.

### Kit Draft Domain Update

The Kit workspace state hook, renamed where appropriate, gains one batch update
operation. That operation accepts ordered project IDs and returns or exposes:

- net project IDs added;
- replaced Frontend identity, if any;
- cumulative project count; and
- capacity outcome.

The domain helper remains the source of truth for deduplication, one-Frontend
replacement, and the 50-project cap. UI components must not reimplement those
rules independently.

## Error Handling

- Unsupported vibration is ignored.
- A cancelled long press produces no selection and no warning.
- A project removed from the catalog before apply is skipped.
- If every selected project becomes ineligible before apply, the draft is not
  created or changed and the dock reports that nothing can be added.
- Capacity and Frontend replacement are normal guidance states, not modal
  errors.
- No partial UI update may leave the tally and draft contents disagreeing.

## Testing Strategy

Implementation follows strict red-green-refactor TDD.

### Unit and Component Tests

Cover:

- dual-range clamping, keyboard increments, and accessible names;
- long-press activation timing;
- movement, cancel, scroll, unmount, and drag-handle cancellation;
- click suppression after a completed long press;
- Space/Enter/Escape keyboard behavior;
- selection persistence through query changes;
- clearing on mode or page exit;
- hidden selections remaining in the tally;
- one-Frontend swap behavior;
- existing-member exclusion and deduplication;
- 50-project capacity with and without Frontend replacement;
- ordered batch append;
- silent background draft creation;
- no forced builder expansion or focus movement;
- transient net-added and settled cumulative status;
- shared control classes and Kit Builder naming; and
- supplied icon orientation.

### End-to-End Tests

Desktop:

- drag handles still add and reorder projects;
- long-press selection works independently of handles;
- repeated select, add, search, select, add cycles preserve browsing state;
- the collapsed rail count updates and opens the Kit Builder;
- the expanded builder remains open without focus theft;
- no Add to Kit buttons render on project tiles; and
- the grid remains fully reachable beside both expanded and collapsed builder
  tracks.

Mobile:

- vertical scrolling cancels pending long press;
- intentional long press selects;
- subsequent taps toggle;
- the selection dock is touch-safe and does not cover the final card;
- Add to Kit does not open the sheet;
- the dock becomes the persistent draft pill;
- repeated selection cycles retain the draft; and
- the pill opens and returns focus from the full-screen Kit Builder.

Accessibility:

- complete keyboard-only selection and add flow;
- focus-visible remains distinguishable from selected state;
- screen-reader names and live status are correct; and
- touch targets meet the 44-pixel contract.

### Visual Regression Tests

Capture and inspect:

- the shared Kits sort and filter controls;
- the single dual-thumb Kit Size track at default and constrained values;
- the expanded Kit Builder;
- the collapsed icon-and-label rail with and without a draft;
- selected project cards of every project kind;
- the desktop selection dock;
- mobile selection dock, transient addition status, and settled draft pill; and
- 320px mobile, representative tablet, 1440px desktop, and the wide desktop
  layout that previously exposed card-header overlap.

## Acceptance Criteria

The refinement is complete when:

1. Kit Size is visibly one track with two accessible thumbs.
2. Kits controls use Tavernary's established visual hierarchy.
3. No user-facing Kit Workspace wording remains.
4. The supplied Kits icon replaces the rotated collapsed-rail control.
5. The collapsed desktop/tablet rail uses readable horizontal text and shows
   draft status.
6. Per-card Add to Kit buttons are absent.
7. Desktop drag-and-drop remains fully functional.
8. Long press and Space enter batch selection without breaking normal
   navigation or scrolling.
9. The floating Add to Kit action displays a separate selection tally.
10. Applying a batch never automatically opens, expands, focuses, or scrolls to
    the Kit Builder.
11. Repeated add/search/filter/add cycles preserve the accumulating draft.
12. One-Frontend replacement, deduplication, and the 50-project cap are enforced
    by shared domain logic.
13. Desktop/tablet rail and mobile draft pill provide persistent, actionable
    cumulative draft status.
14. Unit, E2E, accessibility, and inspected visual-regression suites pass.
