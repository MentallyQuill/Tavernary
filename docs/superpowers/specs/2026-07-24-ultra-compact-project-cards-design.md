# Compact Project Cards Design

**Date:** 2026-07-24  
**Status:** Approved

## Goal

Keep compact catalog cards substantially shorter than standard cards while
making each project's purpose visible at a glance on pointer, touch, and hybrid
devices.

## Information hierarchy

Standard cards retain their current visible details: project summary, project-state notes, metadata chips, license, community score, repository size, preset size, activity, and last-commit age where those facts apply.

Compact cards retain only:

- the project type and subtype icon;
- the activity graph or applicable activity status;
- the last-commit age or applicable source status; and
- the project title; and
- a muted, single-line project summary.

Compact cards hide:

- project-state notes;
- frontend and capability chips;
- the license;
- community aggregate score;
- repository size; and
- preset size.

## Title and summary behavior

The project title is the consistent summary-disclosure target in both standard and compact modes.

- Replace the current `Open [project name]` title tooltip with the project's complete summary.
- Preserve the complete project name in the document and the card link's accessible name.
- In compact mode, visually clamp the title to one line and show an ellipsis when it overflows.
- In compact mode, show the summary beneath the title, clamp it to one line,
  and show an ellipsis when it overflows.
- Use the existing muted summary treatment so the title remains the stronger
  visual element.
- Keep the title tooltip available to pointer hover and keyboard focus.
- Remove the tooltip from the visible summary in standard mode because it would duplicate the title tooltip.
- Keep the entire project card as the external project link.
- Do not add tap-to-expand, a secondary disclosure button, or a two-tap link
  interaction. Touch users receive the glanceable summary without a new
  interaction model.

## Compact layout

Compact mode uses three tightly spaced rows:

1. the existing top identity and activity row; and
2. the single-line project title; and
3. the muted, single-line project summary.

The card has no bottom metadata row. Its height is content-driven but
consistent across cards because neither the title nor summary can wrap.
Existing top-row facts remain aligned and retain their current semantic colors.

## Responsive behavior

The same information hierarchy applies on desktop, tablet, and mobile. Compact
titles and summaries remain single-line at every breakpoint. The summary is not
conditioned on viewport width, hover capability, or primary pointer type; this
keeps compact mode predictable on hybrid devices. The design must not introduce
horizontal page overflow, clipped top-row facts, or tile-internal tooltips.

## Accessibility

- The card remains a single descriptive external link.
- The untruncated title remains available to assistive technology.
- The title tooltip exposes the complete summary on hover and keyboard focus.
- Sighted touch users can read the visible one-line summary without relying on
  a tooltip.
- Compact mode only changes visual density; it does not remove the project summary from the card's accessible description.
- Existing tooltip dismissal, viewport positioning, and mobile suppression behavior remain unchanged.

## Verification

Automated coverage will verify:

- title tooltips contain complete project summaries rather than `Open [project]`;
- standard summaries remain visible without a redundant tooltip;
- compact summaries remain visible, muted, single-line, and ellipsized;
- compact state notes, chips, licenses, community scores, repository sizes, and preset sizes are hidden;
- compact activity, last-commit age, project identity, and title remain visible;
- compact titles use a one-line ellipsis treatment;
- compact cards remain substantially shorter than standard cards;
- pointer and keyboard tooltip behavior still works; and
- updated desktop and mobile compact snapshots match the intended layout.

The full format, lint, palette, catalog, type, unit, build, browser, and visual verification gates must pass before integration.
