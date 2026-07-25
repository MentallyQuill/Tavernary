# Desktop Control Tooltips Design

## Goal

Add consistent desktop hover and keyboard-focus guidance to compact catalog
controls whose iconography is not self-explanatory.

## Tooltip Contract

Use Tavernary's existing shared `Tooltip` component. It already renders through
the document portal, stays within the viewport, dismisses on Escape, responds
to pointer hover and keyboard focus, and suppresses tooltip display at mobile
widths of 760px and below.

The controls and labels are:

- catalog density toggle:
  - `Use compact cards` while standard cards are active;
  - `Use standard cards` while compact cards are active;
- project card Kit control:
  - `Add to Kit` while the project is available;
  - `Remove from selection` while the project is pending selection;
  - `Remove from Kit` while the project belongs to the draft;
- collapsed desktop Kit Builder rail, including its draft-count variant:
  `Open Kit Builder`;
- expanded desktop Kit Builder rail: `Collapse Kit Builder`.

The project card button keeps its existing project-specific accessible name,
such as `Add Recursion to Kit`. Tooltip copy is deliberately shorter and does
not replace the accessible name.

## Responsive and Accessibility Behavior

- Tooltips appear on desktop pointer hover and keyboard focus.
- Mobile Kit Builder controls and all controls at 760px and below retain their
  existing behavior without visible tooltips.
- The controls retain their current button semantics, pressed states, disabled
  reasons, focus behavior, and click targets.
- Tooltip wrappers must not change toolbar, card, or Kit Builder rail layout.

## Implementation Boundaries

- Reuse the shared tooltip implementation rather than adding native `title`
  attributes or a second CSS tooltip system.
- Keep tooltip identifiers unique per rendered control.
- Adjust only the Kit Builder rail label selector if the tooltip wrapper would
  otherwise inherit visible rail-label styling.
- Do not change icons, control placement, Kit selection behavior, Kit Builder
  state, mobile sheet behavior, or tooltip visual styling.

## Testing and Verification

Implementation follows red-green-refactor TDD.

Component tests will verify:

- density tooltip copy follows the current density;
- project Kit tooltip copy follows available, selected, and in-Kit states;
- both desktop Kit Builder rail variants expose `Open Kit Builder`;
- the expanded desktop control exposes `Collapse Kit Builder`;
- hovering or focusing renders the expected tooltip;
- the existing project-specific accessible names remain unchanged.

Responsive browser coverage will verify that a representative tooltip appears
on desktop and does not appear at mobile width. Existing unit, browser, lint,
type, build, and static-export checks must remain green.
