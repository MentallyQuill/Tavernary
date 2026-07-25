# Kit Builder Collapse Icon Design

## Goal

Make the expanded desktop Kit Builder use the same prominent yellow Kit Builder icon as the collapsed rail, flipped to point right so its collapse action is immediately recognizable.

## Design

- Keep the existing `kit-builder` SVG and its existing horizontal flip.
- Override the desktop collapse control so the SVG is `26px` square and uses `var(--color-kind-extension)`, matching the collapsed rail.
- Give the control a comfortable `36px` square hit target with no grey button treatment.
- Keep the mobile close control unchanged.

## Verification

- A desktop browser test must assert the icon, size, yellow color, horizontal flip, and button target.
- Existing unit, browser, lint, type, build, and static-export checks must remain green.
