# Compatible Frontend Popularity Order Design

**Status:** Approved

**Date:** 2026-07-26

**Scope:** Order the Compatible frontend filters in Projects and Kits modes by
the popularity shown on each frontend's catalog card

## Goal

The Compatible frontend filter should surface the most popular frontends first
instead of using alphabetical order. Projects and Kits modes must use the same
ordering so switching modes does not reshuffle the frontend hierarchy.

## Ordering Contract

A shared pure helper matches each frontend filter option to the published
frontend project whose `frontends` labels contain that option's ID. It uses the
matched card's existing `community.aggregate` value, which is the card's
popularity score derived from stars, forks, and subscribers.

Options sort by:

1. scored frontend cards before unscored or unmatched options;
2. descending `community.aggregate`;
3. ascending frontend label for equal or missing scores;
4. ascending frontend ID when labels are equal.

The helper must not mutate its input options or projects. Counts remain the
contextual result counts already shown beside each filter; they do not affect
ordering.

## Integration

The Projects filter continues to source its complete option set from the
frontend vocabulary, then applies the shared popularity order using the catalog
projects passed to `FilterPanel`.

The Kits filter continues to derive its available option set from catalog
projects and published Kits, then applies the same shared popularity order
using the catalog projects passed to `KitFilterPanel`.

Search, selection, initial collapsed visibility, filter counts, and URL/query
semantics remain unchanged.

## Edge Cases

- A frontend option without a corresponding frontend card sorts after scored
  cards.
- A frontend card with missing community data is treated as unscored.
- Extensions that merely declare compatibility with a frontend never supply
  that frontend's popularity.
- Equal popularity scores have deterministic alphabetical ordering.

## Testing and Verification

Implementation follows red-green-refactor TDD.

Focused unit/component tests verify:

- the shared helper ranks frontend options by their respective frontend card
  scores;
- unrelated extension-card popularity cannot influence the order;
- unscored and unmatched options sort last with deterministic ties;
- Projects mode renders Compatible frontend options in the shared order;
- Kits mode renders Compatible frontend options in the same shared order.

After focused tests pass, run the full unit suite and a fresh static production
build. No visual styling changes are required.

## Out of Scope

- changing card popularity calculations;
- sorting by the number of compatible projects or Kits;
- changing any other filter group;
- changing project or Kit result sorting;
- changing frontend vocabulary contents.
