# Kit Builder Desktop Inspector Polish Design

**Date:** 2026-07-26  
**Status:** Draft for written-spec review

## Summary

Refine the viewed-Kit experience inside the desktop Kit Builder without making
the panel wider and without changing the mobile layout.

The desktop inspector will become one continuous, internally scrollable
document. The Kit summary, action controls, project heading, and project cards
will all move through the existing panel-body scroll container. The project
stack will no longer create a second nested scrollbar.

The remaining scrollbar will use a narrow Tavernary treatment rather than the
wide native Windows track shown in the current interface. Reducing horizontal
panel and stack gutters will recover a modest amount of card width without
changing the Kit Builder column width.

The Kit summary and administrative actions will also adopt the site's existing
typography, spacing, surface, button, focus, and color vocabulary.

## Goals

- Remove the nested project-list scrollbar from the desktop Kit inspector.
- Keep one discoverable scrollbar for the complete desktop inspector body.
- Make that scrollbar visually quiet and spatially efficient.
- Recover project-card width without enlarging the Kit Builder panel.
- Make the inspected Kit summary conform to the existing Kit-card type scale.
- Make **Report Kit** and **Request withdrawal** look and behave like controls.
- Preserve direct whole-card project links, project order, and unavailable-card
  handling.
- Preserve the current mobile layout, scroll ownership, and touch behavior.
- Preserve the Kit Builder's collapsed-state persistence and opening/closing
  animation.

## Non-Goals

- Increasing the desktop Kit Builder column width.
- Hiding all scrollbars or making scrollability hover-only.
- Replacing project cards with rows, accordions, pagination, or a carousel.
- Changing project-card content, metadata, or link behavior.
- Changing Kit schema, Kit URLs, report URLs, or withdrawal URLs.
- Changing create/edit builder composition, drag-and-drop, or draft storage.
- Restyling scrollbars anywhere outside the Kit Builder.
- Redesigning the mobile Kit Builder.

## Current-State Diagnosis

### Scroll ownership

The general `.kit-builder-panel-body` is scrollable, but inspect mode disables
that scrolling. The nested `.kit-project-stack` then becomes the scroll owner.
This places a large scrollbar beside the project cards while the browser page
retains its own scrollbar at the outside edge.

The result is visually heavy and creates a nested wheel/trackpad target inside
an already scrollable page.

### Card width

The panel width is sufficient. Width is lost inside it to:

- 18px panel padding on each side;
- 4px body inline padding;
- 2px project-stack padding;
- the native scrollbar track.

The cards can gain useful width by reducing these internal gutters and using a
6px scrollbar without altering the layout's Kit Builder grid track.

### Summary hierarchy

The inspected Kit title, author, and description use broad panel selectors and
unscoped heading/paragraph defaults. Their scale is larger and looser than the
same information on Kit cards.

### Action affordance

**Duplicate**, **Edit**, and **Copy link** use bordered controls. **Report Kit**
and **Request withdrawal** use `control-quiet`, so they read as secondary text
rather than actions.

## Considered Approaches

### 1. One panel-body scrollbar with a narrow themed treatment

Make the inspector body the sole internal scroll owner and let the project
stack participate in normal flow.

**Advantages**

- Removes the nested scrollbar and wheel trap.
- Keeps the persistent desktop Kit Builder architecture.
- Works for Kits containing one project or fifty projects.
- Requires no hidden content, pagination, or additional navigation.
- Preserves keyboard and assistive-technology scroll discoverability.

**Trade-off**

- The browser page and the Kit Builder remain independent adjacent scroll
  regions on desktop. The Kit Builder's scrollbar must therefore be visually
  restrained.

**Decision:** Adopt.

### 2. Keep nested scrolling and only restyle its scrollbar

This is the smallest CSS change.

**Rejected because**

- The project stack remains a nested scroll target.
- Summary and actions remain disconnected from the content being scrolled.
- It treats the most visible symptom without correcting scroll ownership.

### 3. Hide the scrollbar and rely on fades, wheel input, or paging controls

**Rejected because**

- Hidden scrollbars reduce discoverability and keyboard confidence.
- Paging or carousel controls bury projects and scale poorly for large Kits.
- Hover-only visibility is unsuitable for keyboard users and creates an
  inconsistent Windows experience.

### 4. Let the browser page own all Kit Builder scrolling

**Rejected because**

- Long Kits would make the entire catalog page extremely tall.
- Kit Builder content would lose its persistent workspace behavior.
- Create/edit workflows would become coupled to catalog-page scroll position.

## Approved Design

### 1. Preserve panel width and layout state

The existing desktop `--kit-builder-expanded-width` and catalog grid tracks
remain unchanged.

The implementation must continue to use
`data-kit-builder-collapsed` on `.catalog-layout`. It must not reintroduce a
descendant `:has(...)` dependency for initial width or visibility.

The expanded panel must retain a stable inner canvas throughout its open and
close animation. Replace the existing hard-coded inner-width subtraction with
a named content-inset variable derived from the approved desktop padding.
Content must not reflow between animation frames.

### 2. Give desktop inspection one internal scroll owner

For desktop inspect mode:

- `.kit-builder-panel-body` uses `overflow-y: auto`;
- `.kit-project-stack` uses `overflow: visible`;
- the summary, actions, project heading, and all project cards remain in normal
  document flow inside the body;
- the fixed outer **Kit Builder** header stays outside the scroll container;
- no project-list element establishes a second vertical scrollport;
- overscroll containment belongs to the panel body, not the project stack.

The complete summary and action area scrolls away with the project list. This
is intentional: keeping that large block fixed would recreate the cramped
project viewport that caused the nested scrollbar.

Short Kits that fit inside the panel body show no scrollbar.

### 3. Use a narrow, accessible scrollbar

The scrollbar treatment is scoped to the desktop Kit Builder panel body:

- native width: `thin` where supported;
- WebKit scrollbar width: 6px;
- track: transparent;
- thumb: `--color-border-strong`;
- thumb hover: `--color-border-hover`;
- thumb radius: 999px;
- no custom arrow controls;
- no opacity animation or width change between rest and hover;
- the scrollbar remains available whenever the browser determines the body
  overflows.

The treatment must use semantic palette tokens and pass the palette audit.

Subtle top and bottom edge fades reinforce that more content exists. They must:

- appear only when content is hidden in that direction;
- use noninteractive overlays with `pointer-events: none`;
- update after scrolling, resizing, or content changes;
- disappear completely at their respective boundary;
- not be required to understand that the panel scrolls.

The fades are supporting feedback. The visible scrollbar remains the primary
scroll affordance.

### 4. Recover card width through gutters

The panel itself does not grow.

Desktop horizontal spacing changes are limited to:

- reduce panel horizontal padding from 18px to 12px;
- remove `.kit-builder-panel-body` inline padding in inspect mode;
- remove `.kit-project-stack` padding;
- retain at least 8px between card content and the scrollbar thumb;
- retain the existing 12px vertical gap between project cards.

At the 1440px Chromium desktop baseline, these changes must increase the
project card's rendered width by at least 12px without changing the panel's
outer width.

The project cards remain one column and retain the existing shared
`ProjectCard` rendering and whole-card canonical link.

### 5. Restyle the Kit summary with existing site typography

The inspected Kit summary receives dedicated classes instead of relying on the
generic `.kit-builder-panel h2` and `.kit-builder-panel p` rules.

Its hierarchy is:

1. Kit icon;
2. Kit title;
3. muted `@author`;
4. upper-right project-count tag;
5. four-line description;
6. action controls.

The summary uses the established Kit-card values:

- title: 17px, weight 720, `-0.02em`, line-height 1.3;
- author: 10px, weight 500, muted text, line-height 1.3;
- description: 11px, secondary text, line-height 1.48;
- description clamp: exactly four lines with hidden overflow;
- count tag: the existing Kit project-count tag treatment.

The summary remains an unboxed section of the sidebar. It must not become a
card nested inside the Kit Builder surface.

The project count moves into the summary tag. The project section begins after
a normal divider or spacing break and retains an accessible **Projects**
heading.

### 6. Give all actions button affordance

The action URLs remain anchors and continue opening their current GitHub issue
forms in a new tab.

Visual treatment:

- **Duplicate**, **Edit**, and **Copy link** remain secondary controls;
- **Report Kit** becomes a bordered secondary control;
- **Request withdrawal** becomes a restrained danger-outline control using
  `--color-danger-border` and `--color-danger-text`;
- withdrawal hover/focus uses the existing danger palette without becoming a
  filled destructive confirmation button;
- all five actions expose the same 36px desktop control height, focus ring,
  press feedback, and border radius used by site controls.

Desktop arrangement:

- first row: Duplicate, Edit, Copy link;
- second row: Report Kit, Request withdrawal;
- labels must remain fully visible without horizontal clipping.

Mobile retains its existing 44px target requirement and responsive action
layout. Only the two administrative links' visual affordance changes; the
mobile sheet structure and scrolling must not change.

## Component Boundaries

### `KitBuilderPanel`

- Owns the inspected Kit summary and action markup.
- Keeps issue URLs and existing event handlers unchanged.
- Supplies the body scroll container.
- May expose top/bottom scroll-boundary state if edge fades are implemented.

### `KitProjectStack`

- Preserves ordered project rendering.
- Preserves direct canonical links and unavailable-card treatment.
- Stops owning vertical scrolling on desktop.

### `ProjectCard`

- Remains the single source of project-card markup and behavior.
- Receives no new inspector-specific content or data contract in this work.

### Styles

- Desktop panel scrolling, scrollbar, summary, action, and gutter rules live in
  the existing Kit Builder sections of `catalog.css`.
- Mobile overrides remain in `responsive.css`.
- Scrollbar selectors are strictly scoped to the Kit Builder panel body.

## Responsive Behavior

### Desktop, wider than 760px

- Existing Kit Builder width remains unchanged.
- Panel body owns the only internal scrollbar.
- Project stack is normal flow.
- Narrow themed scrollbar is active.
- Reduced gutters widen the cards.
- Actions use the three-plus-two arrangement.

### Mobile, 760px and below

- Existing full-screen dialog behavior remains unchanged.
- Panel body continues to own scrolling.
- Project stack remains overflow-visible.
- Safe-area padding, 44px touch targets, focus trapping, and close behavior
  remain unchanged.
- No mobile snapshot changes except where the two newly button-styled
  administrative links are visible.

## Accessibility and Interaction

- The panel body must be reachable and scrollable with mouse wheel, trackpad,
  keyboard, and touch input appropriate to the platform.
- The scrollbar must not become invisible until hover.
- Edge fades must never intercept clicks, focus, or pointer scrolling.
- All action anchors retain meaningful text, focus visibility, `target="_blank"`,
  and their current URLs.
- Project cards remain links and retain their current accessible names.
- The accessible project-list heading remains associated with the list.
- Reduced-motion mode must not animate scroll feedback or action transitions.

## Edge Cases

- A one-project Kit fits without a forced scrollbar.
- A three-project Kit uses the full panel body naturally; no nested track
  appears beside the cards.
- A fifty-project Kit scrolls through the final project using the panel body.
- Long Kit titles and four-line descriptions do not push actions outside the
  readable width.
- Unavailable projects retain their disabled presentation and remain
  noninteractive.
- Resizing across the 760px boundary transfers scroll ownership without
  horizontal overflow or stale scroll indicators.

## Verification

### Unit and contract tests

- Assert inspect mode gives vertical scrolling to the panel body.
- Assert the project stack does not establish vertical overflow.
- Assert the desktop panel-width variables and grid track are unchanged.
- Assert the scrollbar uses semantic tokens and a 6px WebKit width.
- Assert summary title, author, description, and four-line clamp values.
- Assert Report Kit and Request withdrawal use button classes and preserve
  their URLs and external-link behavior.
- Assert no project-card markup is duplicated inside the Kit feature.

### Browser behavior

At a 1440px desktop viewport:

- open a three-project Kit;
- confirm the project stack has no independent vertical scroll range;
- scroll the panel body and confirm the final project is reachable;
- confirm only the panel-body scroll position changes;
- confirm project cards are wider than the current baseline while the panel's
  outer width is unchanged;
- confirm all five actions are visible, bounded, and keyboard-focusable.

Repeat with a fifty-project Kit and confirm the final available and unavailable
cards remain reachable.

At 390px and 320px:

- confirm the full-screen sheet retains one body scroll;
- confirm there is no document-level horizontal overflow;
- confirm action targets remain at least 44px;
- confirm existing direct-link project-card behavior remains unchanged.

### Visual proof

Capture and inspect:

- desktop three-project Kit at the top of the inspector;
- desktop three-project Kit after panel-body scrolling;
- desktop long Kit showing the narrow scrollbar;
- Report Kit hover/focus;
- Request withdrawal hover/focus;
- existing 390px and 320px inspector baselines.

The visual review must confirm:

- no scrollbar begins beside the project heading;
- the remaining scrollbar is narrow and aligned with the panel edge;
- cards gain width without changing panel width;
- the summary matches Kit-card typography;
- administrative links visibly read as buttons;
- mobile layout remains visually intact.

## Acceptance Criteria

The design is complete when:

- the desktop Kit Builder panel width is unchanged;
- the desktop inspector has one internal scrollbar owned by the panel body;
- the project stack has no independent scrollbar;
- the remaining scrollbar is narrow, themed, and discoverable;
- project cards gain width through reduced internal gutters;
- the Kit summary uses the established Kit-card type scale and four-line clamp;
- Report Kit and Request withdrawal have button affordance;
- project URLs, issue URLs, project order, and unavailable state are unchanged;
- mobile layout and scroll behavior remain intact;
- focused unit, browser, visual, palette, typecheck, and production-build gates
  pass.
