# Kit Card and Inspector Polish Design

**Date:** 2026-07-25
**Status:** Approved

## Summary

Polish published Kit cards and replace the viewed-Kit project disclosures with
the existing compact project-card presentation.

The project cards inside a viewed Kit must match the approved compact project
card precisely: the same surface, spacing, typography, kind identity, freshness
and activity treatment, creator line, description, focus treatment, and motion.
Each available card is a direct external link to the project's canonical URL.
There is no disclosure control, expanded details area, or buried project link.

This work also adds accessible tooltips and motion to the Kit card's **Copy
link** and **Report** actions, provides explicit clipboard feedback, removes the
low-value **Support unavailable** placeholder, and promotes the project count
to an upper-right tag.

## Goals

- Make Copy link and Report understandable and responsive to interaction.
- Confirm successful clipboard writes without stealing focus.
- Omit missing support data instead of presenting it as Kit content.
- Make project count visible at scan level in the Kit card's upper-right area.
- Render the projects in a viewed Kit as faithful compact project cards.
- Make a viewed Kit's project list independently scrollable on desktop.
- Make every available viewed-Kit project card a direct external link.
- Preserve project order, responsive behavior, keyboard access, and reduced
  motion support.

## Non-Goals

- Changing Kit schema, moderation, ranking, support collection, or share URLs.
- Changing project-card visual design.
- Adding dropdowns, accordions, project-detail disclosures, or nested links.
- Adding Kit membership controls to viewed-Kit project cards.
- Changing create, duplicate, or edit composition behavior.
- Reworking the builder's editable drag, reorder, or remove controls.
- Adding a general-purpose application notification system beyond the small
  reusable notice needed by Kit sharing.

## Current-State Problems

- Kit card Copy link and Report actions have no tooltip or action-specific
  hover and press feedback.
- A successful card-level clipboard copy produces no visible confirmation.
- `supporterCount: null` renders as **Support unavailable**, giving unavailable
  telemetry unnecessary visual weight.
- Project count is buried in the ordinary metadata row.
- Viewed Kits use expandable compact rows. The canonical project link is inside
  the expansion, so opening a project requires an unnecessary disclosure step.
- The viewed-Kit list does not reproduce the compact project card that users
  already recognize elsewhere in the catalog.

## Considered Approaches

### 1. Reuse the compact ProjectCard presentation

Render the existing compact project-card treatment in a Kit-inspector context,
with Kit-selection controls suppressed.

**Advantages**

- Exact visual fidelity.
- Shared project metadata, freshness, activity, accessibility, and motion.
- Future project-card fixes automatically reach the viewed-Kit list.
- Avoids maintaining a second interpretation of the reference design.

**Trade-off**

- The shared project-card surface needs an explicit inspector context or a
  small presentation boundary so irrelevant Kit-selection controls are absent.

### 2. Extract shared project-card primitives

Break the project card into smaller shared pieces and assemble a separate
inspector card.

**Advantages**

- Clearer context-specific composition.
- Avoids conditional branches inside a single card.

**Trade-offs**

- Larger refactor.
- More opportunity for the two compositions to drift.

### 3. Build a new compact lookalike

Create a dedicated miniature card that resembles the catalog card.

**Advantages**

- Small initial component.

**Trade-offs**

- Duplicates design and behavior.
- Cannot guarantee precise visual parity.
- Likely to drift as project cards evolve.

### Decision

Use approach 1. The supplied compact project card is a literal visual contract,
not loose inspiration. Reuse the existing presentation and introduce only the
minimum context needed to suppress Kit-selection controls.

## Kit Card Design

### Structure

The Kit card remains an article with separate interactive regions:

- a title-and-description button that opens the Kit in the Builder;
- sibling Copy link and Report actions;
- noninteractive metadata and badges.

The card must not become one button containing other buttons. The existing
selection and action boundaries remain intact.

### Project Count Tag

Move project count out of `.kit-card-metadata` and render it in the card's
upper-right identity area.

- Copy is `<count> Project` for one project and `<count> Projects` otherwise.
- The tag uses the existing compact tag vocabulary.
- It remains visible in ordinary, hover, selected, and keyboard-focus states.
- It participates in the layout and must not be absolutely positioned over the
  title, author, or description.
- Long Kit titles and narrow cards wrap without colliding with the tag.
- Published and Updated dates remain in ordinary metadata.
- Project count appears only once.

### Missing Support

- When `supporterCount` is a number, render the existing singular or plural
  supporter count.
- When `supporterCount` is `null`, omit the support metadata item.
- Do not render placeholder copy, an empty chip, a tooltip, or reserved gap.
- This does not change support data, filters, sorting, or ranking.

## Copy Link and Report Actions

### Tooltips

Use the existing `Tooltip` component for both Kit card actions.

- Copy link tooltip: **Copy a direct link to this Kit**
- Report tooltip: **Report this Kit on GitHub**
- Tooltips appear on fine-pointer hover and keyboard focus.
- They close on pointer leave, blur, Escape, or a phone-layout transition.
- Phone layouts retain the visible button labels and do not show hover
  tooltips.
- The visible labels remain **Copy link** and **Report**.
- Accessible button names remain stable.

The same Copy link tooltip and feedback contract applies to the Copy link
action in the viewed-Kit Builder. Report links in the Builder keep their
descriptive visible label; adding a Builder Report tooltip is outside this
change.

### Hover, Focus, and Press Motion

Copy link and Report receive action-specific feedback.

Fine-pointer hover and keyboard focus:

- strengthen border and text or icon color;
- lift the action slightly;
- preserve an obvious `:focus-visible` outline;
- transition over 150 milliseconds using the existing Kit easing variables.

Active press:

- compress to `scale(0.98)`;
- use the existing fast press duration;
- return to the correct hover or rest state on release.

Copy link remains the stronger utility action. Report remains visually quiet
but must not feel inert.

Under `prefers-reduced-motion: reduce`, remove translation and scaling.
Color, border, and focus feedback remain.

## Clipboard Feedback

### Success

After `copyKitLink` resolves as `copied`, show one transient notice:

> Kit URL copied to clipboard

The notice:

- uses `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`;
- appears immediately after clipboard success;
- does not take focus;
- does not require dismissal;
- remains visible for 2,000 milliseconds;
- fades and rises into view, then fades out;
- restarts its timeout when another Kit URL is copied;
- never stacks duplicate notices;
- sits above the viewport safe area, mobile controls, and the project-selection
  dock;
- is available from both catalog Kit cards and Builder inspect mode.

The Copy link button may briefly show a success icon or visual state, but its
width and accessible name must not change.

### Failure

If clipboard writing fails:

- do not show the success notice;
- show a failure status such as **Couldn't copy automatically. Select the URL
  below.**;
- expose a readonly text field containing the share URL;
- select the URL when the field receives focus;
- preserve the existing share URL format.

Card-level Copy link and Builder-level Copy link must use the same result and
feedback path so they cannot disagree.

## Viewed-Kit Project Cards

### Literal Visual Contract

Every available project in a viewed Kit uses the existing compact project-card
presentation. It must retain:

- the same card surface, border, radius, padding, and kind accent;
- upper-left project-kind icon and uppercase kind label;
- upper-right freshness label;
- activity fraction and segmented activity meter;
- project title;
- muted creator line;
- project summary typography and wrapping;
- linked-card hover, active, and focus-visible treatments.

The Builder may constrain card width, but it must not invent a smaller
typographic scale, remove reference-card content, or substitute a row layout.

### Navigation

- The available project card's primary surface is an anchor to
  `component.canonicalUrl`.
- It opens in a new tab with `target="_blank"` and
  `rel="noopener noreferrer"`.
- Pointer users can click anywhere on the card's primary surface.
- Keyboard users reach each card as one ordinary link and activate it with
  standard link behavior.
- There is no disclosure `+` or `-`, `aria-expanded`, expanded details block,
  nested project-name link, or click handler that toggles local state.
- There is no Kit add/remove control in inspect mode.

### Unavailable or Flagged Projects

A component without a usable canonical URL cannot pretend to be a link.

- Retain the compact card's dimensions and identity hierarchy.
- Render a noninteractive disabled treatment.
- Replace activity information with the controlled unavailable reason.
- Suppress linked-card hover, press, and pointer affordances.
- Preserve the component's position in the authored order.
- Ensure the state is conveyed in text and not only by color.

## Builder Inspect Layout

### Desktop and Tablet

Inspect mode becomes a bounded vertical layout:

1. Kit identity, full description, and Kit actions.
2. Project-list heading with project count.
3. Compact project-card list filling the remaining height.

The Kit identity and actions remain available while the project list scrolls.
The project-card region:

- uses `min-height: 0` inside the Builder's grid or flex layout;
- uses `overflow-y: auto`;
- uses `overscroll-behavior: contain`;
- has no horizontal scrollbar;
- uses the compact catalog gap;
- renders cards at the available Builder width;
- preserves manifest order;
- remains usable at the maximum 50-project Kit size.

The Builder's existing viewport-height calculation remains authoritative. This
work must not reintroduce the previous bottom-gap regression.

### Phone

The phone inspection sheet uses the same project cards and direct links.
Because the sheet itself is the bounded surface, its content area may provide
the vertical scroll rather than creating an awkward nested scroll region.

- No horizontal overflow at 320, 360, or 390 CSS pixels.
- Card content wraps according to the existing compact project-card rules.
- Links keep accessible touch targets.
- Closing the sheet preserves the established focus-return behavior.

## Component Boundaries

### KitCard

Owns Kit-level presentation:

- upper-right project-count tag;
- conditional support metadata;
- selection button;
- Copy link and Report action rendering;
- action tooltip anchors.

It reports copy intent upward or through a shared copy-feedback controller. It
does not independently implement clipboard fallback UI.

### Shared Kit Share Feedback

Owns:

- invoking `copyKitLink`;
- success, failure, and fallback state;
- transient-notice timing;
- live-region announcements;
- readonly fallback URL;
- timer cleanup when the surface unmounts.

Catalog Kit cards and Builder inspect mode use this shared behavior.

### KitProjectStack

Becomes a presentational ordered list:

- no expanded-project state;
- no disclosure buttons;
- maps available components to the compact project-card presentation;
- maps unavailable components to the disabled presentation;
- preserves component order.

### ProjectCard Presentation

Accepts or exposes an inspector context that:

- keeps the compact visual contract;
- keeps canonical navigation;
- suppresses project Kit-selection controls;
- avoids builder-specific knowledge in the ordinary catalog path.

## Data Flow

### Copy

1. User activates Copy link from a Kit card or Builder inspect mode.
2. Shared feedback behavior calls `copyKitLink(kit.id)`.
3. On `copied`, it announces and displays the transient success notice.
4. On `fallback`, it announces failure and exposes the selected share URL.
5. A later copy replaces the current feedback and restarts the timer.

### Viewed-Kit Projects

1. Selected Kit supplies ordered `CatalogKitComponent[]`.
2. Each component retains its generated project metadata and canonical URL.
3. Available components render as compact linked project cards.
4. Unavailable components render as noninteractive disabled cards.
5. Navigation goes directly to the canonical project URL without changing Kit
   selection or Builder state.

## Accessibility

- Tooltips supplement visible labels and never replace accessible names.
- All actions retain visible keyboard focus.
- Copy feedback is announced politely without moving focus.
- Repeated copy messages remain announceable by changing or resetting the
  live-region state before reuse when necessary.
- Project cards are anchors, not buttons imitating links.
- Unavailable projects are not focusable as dead links.
- Unavailable reasons are textual.
- Scroll regions are reachable through their linked contents and do not trap
  keyboard focus.
- Reduced-motion users receive equivalent non-motion state feedback.
- Color contrast and target sizes continue to meet the catalog's existing
  control contracts.

## Verification

### Unit and Component Tests

- KitCard renders `<count> Project(s)` once in the upper-right tag.
- Numeric supporter counts remain visible.
- Null supporter count renders no support placeholder.
- Copy link and Report expose the approved tooltip labels on hover and focus.
- Copy success shows and announces one transient notice.
- Repeated copy restarts the timer without stacking notices.
- Clipboard failure exposes and focuses or selects the fallback URL as
  specified.
- KitProjectStack renders available projects as direct external links.
- KitProjectStack contains no disclosure controls or `aria-expanded`.
- Unavailable projects remain visible and noninteractive with a reason.
- Inspector cards do not expose Kit add/remove controls.

### Browser Tests

- Copying from a catalog Kit card writes the expected `mode=kits&kit=<id>` URL
  and shows the success notice.
- Copying from Builder inspect mode produces the same result.
- Report opens the prefilled GitHub report URL.
- Hover and press states apply to both actions.
- Clicking anywhere on an available inspector project card opens its canonical
  URL.
- A large Kit scrolls inside the desktop project-list region while the Kit
  header and actions remain visible.
- Phone inspection scrolls without horizontal overflow or nested disclosure
  interactions.
- Keyboard navigation reaches Copy link, Report, and every available project
  link in a sensible order.

### Visual Tests

Capture:

- ordinary, hovered, focused, and selected Kit cards;
- singular and plural project-count tags;
- null and numeric supporter states;
- Copy and Report hover and active states;
- success and failure copy notices;
- desktop viewed-Kit inspector with the supplied compact project-card
  presentation;
- a scrolled large-Kit inspector;
- 390-pixel and 320-pixel phone inspection;
- unavailable project treatment;
- reduced-motion behavior where automation supports it.

Visual review must compare the inspector cards against the existing compact
catalog project card, not against the removed disclosure row.

## Acceptance Criteria

- Viewed-Kit project cards are visually identical to the existing compact
  project card apart from width imposed by the Builder.
- Every available viewed-Kit project opens its canonical URL directly from the
  card surface.
- No project disclosure or buried URL remains in inspect mode.
- The desktop project list scrolls independently and retains Kit identity and
  actions.
- Copy link and Report have accessible tooltips and clear hover and press
  feedback.
- Successful copies show **Kit URL copied to clipboard**.
- Clipboard failures expose a selectable URL instead of claiming success.
- `Support unavailable` does not appear.
- Project count appears as a singular/plural upper-right tag and nowhere else
  on the Kit card.
- Existing Kit builder create/edit behavior, project ordering, support data,
  report URLs, and responsive focus management remain intact.
