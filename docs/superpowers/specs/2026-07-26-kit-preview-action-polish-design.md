# Kit Preview Action Polish

## Goal

Bring the Kit Builder preview actions into Tavernary's established compact
button language and move the component breakdown to the project list where it
belongs.

## Action controls

- Use the Submit Project control as the size and typography reference: 12px
  text, 36px desktop height, and content-width controls.
- Preserve the existing two semantic action groups while allowing controls to
  wrap naturally within the preview panel.
- Use the supplied Duplicate, Link, and Report artwork for Duplicate, Copy link,
  and Report Kit. Normalize the artwork to `currentColor` so it follows the
  site's theme and interaction states.
- Keep Edit and Request withdrawal text-only.
- Preserve the existing restrained danger treatment for Request withdrawal.
- Scope the supplied artwork to the preview panel; do not change Kit card
  actions.

## Project breakdown

- Remove the project-count pill from the preview heading.
- Render the project section heading on two lines:

  ```text
  PROJECTS
  1 Preset · 1 Extension
  ```

- Keep `PROJECTS` in its existing muted uppercase treatment.
- Render the breakdown with the existing teal preset token at 11px, normal
  casing, and normal letter spacing.
- Omit the invariant Frontend count.
- Omit categories with a zero count.
- Use singular and plural labels correctly.

## Responsive behavior

- Preserve the existing mobile touch-target minimums.
- Keep the two-line project heading on both desktop and mobile.
- Allow compact action controls to wrap without clipping or overflowing.

## Verification

- Add focused component coverage for the supplied preview-only icons, compact
  action treatment, removed count pill, count ordering, zero-count omission,
  and pluralization.
- Rebuild the static export before browser checks.
- Capture or compare the rendered preview at desktop and narrow/mobile widths,
  including relevant hover and focus states.
