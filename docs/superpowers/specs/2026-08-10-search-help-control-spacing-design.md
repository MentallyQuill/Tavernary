# Search Help Control Spacing Design

## Goal

Tighten the `/` and search-help controls against the search field's right edge, reduce the gap between them, and make the help button's visible highlight smaller and precisely centered.

## Approved Geometry

- Keep the search field's existing left inset and reduce only its right inset from 13px to 9px.
- Reduce the rendered gap between the slash keycap and help-button box from 10px to 6px.
- Reduce the help-button box and visible hover/open/focus surface from 28px to 24px.
- Keep the attached 18px question-mark SVG centered in that 24px circle.
- Preserve a 44px effective touch target on coarse-pointer devices with the existing transparent pseudo-element technique.
- Preserve the current mobile rule that hides the slash keycap while showing search help.

## Verification

A desktop browser regression test will measure the right inset, inter-control gap, button size, and icon-to-button center alignment. Existing mobile and search-help interaction coverage must continue to pass, followed by a rendered desktop and mobile visual check.
