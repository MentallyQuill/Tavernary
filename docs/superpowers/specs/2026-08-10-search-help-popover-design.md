# Search Help Popover Design

## Goal

Add a compact question-mark control to the main catalog search bar that explains Tavernary's search syntax, shareable URLs, and `/` keyboard shortcut on desktop and mobile.

## Interaction

- Place the circular question-mark icon immediately to the right of the existing `/` shortcut badge.
- Keep the help control visible at every supported viewport width. The existing `/` badge remains hidden at widths of 760px and below.
- Clicking or tapping the control toggles a compact, non-modal popover titled `Search basics`.
- Close the popover when the user clicks the trigger again, clicks or taps outside the control, or presses Escape.
- Escape returns focus to the help trigger.
- The panel stays within an 8px viewport margin on narrow screens.

## Content

The popover presents five short instructions:

- `A B` — matches results containing A and B.
- `A+B` — matches results containing A or B.
- `A+B C` — matches A, or both B and C.
- Search-result URLs can be copied and shared.
- Press `/` anywhere on the page to jump to search.

The examples describe the existing search contract only. This feature does not change parsing, ranking, filtering, URL serialization, or keyboard-shortcut behavior.

## Components and markup

- Add a focused `SearchHelp` client component responsible for the trigger, popover state, dismissal listeners, and instructional content.
- Add a `SearchHelpIcon` component derived from the supplied circular question-mark SVG. Preserve its paths while converting the fill to `currentColor` so it follows Tavernary's theme.
- Replace the current wrapping search `<label>` with a `<div role="search">`. Associate a visually hidden `<label>` with the input through a stable `id`; this keeps the input's accessible name while avoiding an interactive button nested inside a label.
- The help button uses `type="button"`, the accessible name `Search help`, and synchronized `aria-expanded` and `aria-controls` attributes.
- The popover uses `role="dialog"` and `aria-labelledby` pointing to its `Search basics` heading. It is non-modal and does not trap focus.

## Layout and styling

- The trigger has a 28px visible circular face with a larger 44px touch target on coarse pointers, without increasing the search bar's 42px desktop height.
- The supplied icon renders at 18px and uses existing control, muted-text, focus-ring, surface, border, and shadow tokens.
- The popover is positioned below and right-aligned to the trigger, with a maximum width of 320px and `width: min(320px, calc(100vw - 16px))`.
- The panel sits above catalog content, wraps long text safely, and uses compact typographic spacing consistent with Tavernary's current header.
- Code examples use `<code>` and the keyboard shortcut uses `<kbd>`.
- Reduced-motion preferences disable any panel transition.

## Failure handling

The control is local UI state and has no network or persistence dependency. If JavaScript is unavailable, the normal search input and all existing search behavior remain present; the help control is visible but does not open.

## Verification

- Unit tests cover opening, exact instructional content, toggling, outside-pointer dismissal, Escape dismissal, focus restoration, and ARIA state.
- Desktop browser coverage verifies the trigger appears to the right of the `/` badge and that existing `/` focus behavior still works.
- Mobile browser coverage verifies the help trigger remains visible while the `/` badge is hidden, and the open panel stays within the viewport.
- Focused tests, formatting, lint, typecheck, the production build, static-export verification, and relevant browser suites pass before publication.

## Acceptance criteria

- The attached circular question-mark icon appears to the right of the slash shortcut on desktop.
- The same icon remains available in the mobile search bar.
- Every approved search instruction is visible in the compact popover.
- Mouse, touch, and keyboard users can open and dismiss the panel.
- The interaction is accessible and does not alter existing search or URL behavior.
