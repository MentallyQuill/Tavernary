# Progressive Tag Filter Design

## Summary

Replace the catalog filter's independently scrolling Goals & traits browser
with progressive Goal and Trait previews. Each facet shows its most useful
options first, expands through the same `Show X more` pattern as Compatible
frontend, and participates in one normal filter-panel scroll.

At the same time, make every chip-style filter choice use the compact,
four-pixel bevel established by project-card metadata chips. This removes the
44-pixel, fully rounded tag pills without changing tag vocabulary, filtering
semantics, query URLs, or card presentation.

This design supersedes only the **Filter Experience** presentation described
in `2026-07-29-catalog-tag-system-schema-v6-design.md`. The schema-v6 tag
taxonomy and query semantics remain authoritative.

## Goals

- Remove the tag browser's nested scrollbar.
- Make Goals and Traits browsable without displaying the complete vocabulary
  by default.
- Rank each collapsed facet by catalog usefulness.
- Use dynamically derived `Show X more` disclosure copy.
- Keep selected tags visible while facets are collapsed or search is active.
- Apply the card metadata-chip bevel consistently to chip-style filters.
- Preserve desktop, mobile, keyboard, screen-reader, and shareable-query
  behavior.

## Non-Goals

- Changing the tag vocabulary, tag evidence, or catalog schema.
- Changing Goal/Traits matching semantics.
- Changing active-query serialization or legacy query compatibility.
- Changing project-card chips.
- Adding popularity analytics, personalization, or remembered facet state.
- Redesigning list-style filters such as Project kind, Development, or
  License.

## Current Problem

The current tag browser places the complete vocabulary inside a bounded
results panel. Each tag option has a 44-pixel minimum block size and a fully
rounded radius. The filter rail's narrow width, inset padding, and reserved
scrollbar gutter leave most labels occupying one row each.

The result is low information density and scroll-within-scroll navigation.
The Goals & traits section also uses a different visual language from Model
family, Completion format, and the compact metadata chips on project cards.

Chip-based metadata filters have a second presentation defect. Their current
focus rule uses `:focus-within`, so an ordinary pointer click produces the
same bright outer halo intended for keyboard navigation. The collapsed chip
container clips that outer shadow at its top and side boundaries. This makes
the selected state look overemphasized and visibly cut off.

## Interaction Model

The Goals & traits section renders in this order:

1. One search field across both facets.
2. A selected-tag rail, omitted when there are no selections.
3. A Goals facet preview.
4. A Traits facet preview.

Each facet has independent collapsed and expanded state. In its collapsed
state, it renders a configured preview count. If more options exist, the facet
ends with:

```text
Show {hiddenCount} more
```

`hiddenCount` is always derived from the current facet collection and the
number of previewed options. Vocabulary totals and disclosure counts never
appear as literals in component copy or tests. Expanded facets render every
option and end with `Show fewer`.

The preview limit is an explicit component configuration shared by both
facets. It is independent of the current production vocabulary size, so
adding or removing tags changes the computed disclosure count without a code
or copy update.

The tag results are part of the filter panel's normal document flow. The
bounded results wrapper, maximum block size, scrollbar gutter, and tag-specific
overflow behavior are removed.

## Usage Ranking

Collapsed previews rank options independently inside Goals and Traits:

1. Higher project count first.
2. Alphabetical public label for equal counts.

Missing counts are treated as zero. Ranking uses the same per-tag counts
already supplied to the filter UI; it does not introduce analytics or a
second counting source.

Selections do not reorder or consume the preview. Instead, the selected-tag
rail keeps every active selection visible and removable. Expanding a facet or
finding a selected option through search still renders its checked option in
the normal facet results.

## Search Behavior

Search continues to match public labels, aliases, and descriptions across
both facets.

While the normalized search query is non-empty:

- both facet previews temporarily render every matching option;
- usage ranking remains the result order;
- `Show X more` and `Show fewer` controls are hidden;
- the selected-tag rail remains visible even when a selection does not match;
  and
- zero matches render `No matching goals or traits.` without clearing
  selections.

Clearing search restores each facet's previous expanded or collapsed state.

## Selected-Tag Rail

The rail renders only when at least one tag is selected. It uses the same
public tag labels as the facet options and provides a clear remove affordance
for each selection.

Removing a rail chip uses the existing tag toggle callback. It therefore
updates catalog results, filter count, active-query state, and the shareable
URL through the current data flow rather than introducing separate selection
state.

## Filter-Chip Visual System

All chip-style filter choices share one presentation contract:

- four-pixel border radius;
- compact 26-pixel visual height;
- compact padding aligned with project-card metadata chips;
- six-pixel wrapping gap;
- subdued tabular count;
- visible hover and keyboard-focus states;
- a subtle teal fill, restrained one-pixel accent border, and checkmark when
  selected;
- no additional focus halo after an ordinary pointer click;
- a distinct `:focus-visible` keyboard indicator rendered inside the chip
  boundary so it cannot be clipped; and
- disabled styling that does not rely on opacity alone.

This contract applies to Goal tags, Trait tags, Model family, Completion
format, and future choices that opt into the chip presentation. It replaces
the tag browser's 44-pixel minimum size and fully rounded radius.

Project cards retain their existing chip markup and styling. A dedicated
filter-choice chip abstraction shares the established proportions without
coupling interactive filter markup to card presentation.

## Component Boundaries

### `TagBrowser`

`TagBrowser` owns:

- normalized search state;
- independent Goal and Trait expansion state;
- facet partitioning;
- usage ranking;
- preview and hidden-count derivation;
- selected-rail rendering; and
- empty-result presentation.

It remains controlled for selections through `selected` and `onToggle`.

### Filter-choice chip

A reusable, controlled filter-choice chip owns:

- checkbox or radio input semantics;
- label and count presentation;
- selected, disabled, hover, and focus states; and
- the shared beveled styling hooks.

`TagBrowser` and chip-presented `FilterGroup` options consume this abstraction.
It does not own selection state, ranking, filtering, or result counts.

### Existing filter and query flow

`ProjectFilterPanel` continues to supply vocabulary definitions, selection
state, counts, and the existing toggle callback. No new catalog-query field or
URL parameter is introduced.

Filtering remains:

```text
matches any selected Goal
AND
matches any selected Trait
```

Within-facet selections remain OR conditions. An unselected facet imposes no
constraint.

## Accessibility and Responsive Behavior

- Goal and Trait collections remain semantic fieldsets with labelled legends.
- Native checkbox or radio inputs remain the interaction source.
- Disclosure controls expose `aria-expanded`.
- Selected-chip removal has an accessible name containing the public tag
  label.
- Pointer selection does not trigger the keyboard-focus indicator.
- Keyboard focus remains visually distinct from selection and is contained
  within the chip boundary at every container edge.
- Search result and selection status announcements remain polite.
- Keyboard users can reach every visible option, disclosure control, and
  selected-chip removal action.
- Focus indicators remain visible against selected and unselected surfaces.
- Desktop and mobile use the same data and interaction contract.
- The mobile filter sheet must not gain horizontal overflow.
- The tag area must not create an independent vertical scroll region.

## Edge Cases

- A facet with no options is omitted.
- A facet with no hidden options has no disclosure control.
- Missing tag counts rank as zero and render consistently with existing count
  policy.
- A vocabulary update immediately changes ranking and the computed hidden
  count.
- A selected tag outside the collapsed preview remains in the selected rail.
- Empty search results do not collapse facets or clear selections.
- Clearing search restores the facet expansion state that existed before
  search.

## Verification

### Unit tests

- Rank each facet by descending count.
- Break equal-count ties alphabetically.
- Treat absent counts as zero.
- Derive `Show X more` from fixture data and configured preview size.
- Expand and collapse Goals and Traits independently.
- Preserve and remove selections through the selected-tag rail.
- Search labels, aliases, and descriptions.
- Keep selected tags visible during a nonmatching search.
- Render the empty state without clearing selection.
- Avoid assertions tied to production vocabulary totals.

### Catalog end-to-end tests

- Verify the desktop filter has no nested tag scrollbar.
- Verify both facets expose dynamic `Show X more` controls when needed.
- Expand one facet without expanding the other.
- Select and remove a tag through both option and rail controls.
- Confirm catalog results and shareable URL state remain synchronized.
- Confirm Goal/Traits composition semantics remain unchanged.
- Exercise keyboard focus and disclosure state.
- Confirm pointer selection uses only the subtle selected treatment.
- Confirm keyboard focus adds a distinct, fully visible internal indicator.
- Verify the mobile filter sheet has no horizontal overflow.

### Visual and contract tests

- Assert chip-style filter options use the four-pixel bevel.
- Assert the tag option no longer uses a 44-pixel minimum block size or a
  fully rounded radius.
- Assert Goal and Trait options wrap compactly at desktop and mobile widths.
- Assert the bounded tag-results presentation and its overflow rules are gone.
- Assert pointer-selected and keyboard-focused chip states remain distinct.
- Place a keyboard-focused chip at each collapsed-container boundary and
  assert that its focus indicator is not clipped.
- Keep vocabulary counts fixture-derived instead of freezing production
  inventory totals.

## Implementation Scope

The implementation is expected to touch:

- the shared filter-control component surface;
- the tag-browser component;
- catalog filter styles;
- focused tag-browser unit tests;
- catalog E2E tests; and
- visual-alignment contract tests.

No registry record, vocabulary entry, schema, catalog build, workflow, or
project-card component should require a behavior change.
