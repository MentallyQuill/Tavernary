# Inline Fork Relationship Design

## Goal

Forked project cards must retain the same layout and height as ordinary project
cards. The fork relationship belongs in the existing utility row, immediately
after the license:

`AGPL-3.0 · Fork of SillyTavern`

## Interaction

- For a published upstream project, `Fork of {parent}` is the relationship
  control. Activating it opens the existing two-project relationship view.
- The redundant `View relationship` text is removed.
- When the relationship view is already active, the fork label remains visible
  without offering a redundant action.
- For an unavailable or unlisted upstream, the fork label and its existing
  availability status remain non-interactive.
- The project card continues to open its canonical repository, and the fork
  control remains a sibling of that link so interactive elements are not
  nested.

## Layout

- Remove the fork-only bottom padding and standalone relationship row.
- Visually align the sibling relationship control over the existing
  `.card-utility` row.
- Favor the left edge: license, separator, and fork relationship read as one
  compact sequence rather than spreading across the card.
- Reserve the existing far-right space for the Kit `+` or `-` control.
- Long parent names truncate with an ellipsis before reaching the Kit control.
- Compact-card behavior and responsive relationship-pair layout remain
  unchanged except for removal of the redundant relationship action.

## Accessibility

- The clickable fork label remains a native button with an accessible name
  describing the parent-child relationship.
- Existing hover and focus-visible affordances remain.
- The decorative separator is hidden from assistive technology.

## Verification

- A component test proves that the utility sequence is license, separator, then
  fork relationship, with no `View relationship` text.
- A CSS contract test proves that fork cards no longer receive extra bottom
  padding and that the inline relationship is bounded before the Kit control.
- A rendered browser test compares fork and ordinary card geometry, checks that
  their heights match, and confirms long relationship text does not overlap the
  Kit control or cause horizontal overflow.
