# Project Card License Utility Row

**Date:** 2026-07-25
**Status:** Approved design

## Goal

Stop the project license from reducing the width available to frontend and
capability chips. Standard project cards will give metadata chips two
full-width lines, then place the license and Kit control in a separate bottom
utility row.

## Card Layout

The standard card presents two stacked footer regions:

1. A metadata region spanning the card's full content width. It retains a
   maximum height of two chip lines.
2. A utility row with the existing license label aligned left and visual space
   reserved for the existing `+` or `−` Kit control at right.

The footer divider remains above both regions. License styling, status colors,
tooltip copy, and accessible license description remain unchanged.

The card shell positions the Kit control in the utility row's reserved space.
The control remains a sibling of the card link so using it never activates the
GitHub link. Its visible face and touch target remain the same size.

## Responsive and Compact Behavior

- Standard desktop and mobile cards use the stacked metadata and utility rows.
- Metadata chips receive the full card width at every standard-card viewport.
- The metadata region remains clipped after two line heights rather than
  increasing card height for projects with many chips.
- Compact cards continue to hide the complete footer, including metadata,
  license, and utility row.
- The license and Kit control must not overlap at the narrowest supported card
  width.

## Implementation Boundary

Keep the existing project-card data and interaction model. This is a markup and
layout change limited to the card footer and its responsive geometry; it does
not change license facts, chip ordering, tooltips, Kit selection state, or
compact-card content.

## Verification

- Component tests prove the card presents a full-width metadata region followed
  by a license utility row while the sibling Kit control retains independent
  button semantics.
- CSS contract tests prove two-line chip clipping, full-width metadata, and
  left/right utility alignment.
- Narrow mobile visual coverage proves that long metadata labels no longer
  compete with the license and do not overlap the Kit control.
- Existing Kit-control navigation and compact-card tests continue to pass.

## Out of Scope

- Changing license wording or replacing it with an icon.
- Showing additional chip lines.
- Moving the Kit control outside the card's bottom-right utility position.
- Changing which metadata chips appear or their ordering.
