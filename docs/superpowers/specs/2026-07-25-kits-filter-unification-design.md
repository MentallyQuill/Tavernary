# Kits Filter Unification Design

**Date:** 2026-07-25

**Status:** Approved

**Scope:** Unify the Kits filter rail with All Projects while keeping a small,
Kit-level discovery vocabulary.

## Goal

Make the Kits filter rail look and behave like the All Projects filter rail
without copying project-level facets that become indiscriminate or misleading
when applied to mixed collections.

The result must:

- use the shared typography, spacing, controls, counts, disclosure patterns,
  mobile sheet treatment, and legal footer;
- retain the dual-thumb Kit-size slider;
- filter on properties that meaningfully describe the Kit as a whole;
- remain static-first and URL-restorable;
- leave discovery ranking to community support and Trending.

## Approved Filter Set

The Kits rail contains these groups in this order:

1. **Compatible frontend**
2. **Purpose**
3. **Includes project**
4. **Kit size**
5. **Kit status**, containing only **All components available**

### Compatible Frontend

This multi-select facet is derived from each Kit's frontend labels. It uses the
shared list treatment, including contextual option counts, search, and
collapsed overflow when needed.

### Purpose

This multi-select facet is derived from the primary functions represented by a
Kit's non-Frontend components. It uses the shared metadata chip-cloud
treatment.

### Includes Project

This remains a single searchable canonical-project selector. Its visible
option label is the project's display name; its stored and serialized value is
the canonical project ID.

### Kit Size

Kit size is an inclusive dual-thumb range from 3 to 50 projects, with persistent
minimum and maximum readouts.

### All Components Available

This boolean matches Kits whose `flaggedProjectCount` is zero. There is no
inverse option; users omit the filter when they are willing to inspect Kits
containing flagged components.

## Deliberately Excluded Filters

The Kit rail does not include creator, included project kind, component
capabilities, component development state, or component license.

Those facets use existential matching against individual components. Useful
Kits tend to contain many kinds of components, development states, and license
statuses, causing most Kits to satisfy several options simultaneously. A
component license also must not be presented as though it licenses the Kit as
a bundle.

There is no maintainer-curated editorial status. GitHub reaction support and
Trending provide the community-managed discovery signal.

## Matching Semantics

Selections within Compatible frontend and Purpose use OR. Different groups and
search use AND.

For example:

```text
(SillyTavern OR Lumiverse)
AND (Memory & Retrieval)
AND (Kit size 5 through 12)
AND (All components available)
```

## URL Contract

Kits mode serializes only:

- `frontend`
- `purpose`
- `includes`
- `minProjects`
- `maxProjects`
- `available`
- `sort`

Obsolete component-derived or editorial query parameters are ignored.

## Shared Visual and Interaction Contract

- Desktop uses the shared `Filters` title and `Clear all` action.
- Mobile uses the shared modal sheet, close icon, focus trap, dismissal, and
  focus restoration.
- Filter options show contextual Kit counts.
- Purpose and project selectors remain searchable.
- The legal footer remains shared with the project rail.
- Active-query tokens exist for every retained filter.
- Clearing filters preserves the current Kit sort.

## Verification

Unit and browser tests cover:

- the exact five-group order;
- absence of obsolete controls and query fields;
- OR-within and AND-across behavior;
- inclusive Kit-size bounds;
- all-components-available matching;
- URL parsing and serialization;
- active-token removal;
- desktop and mobile layout, keyboard access, and touch targets.
