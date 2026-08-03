# Project Date Added Sort Design

## Goal

Add an explicit **Date Added** sort to the project catalog. It orders the full
filtered project result set by the date Tavernary accepted and published each
project, newest first.

This is distinct from **Recent Activity**, which continues to rank the newest
qualifying source activity or release. Kit sorting is unchanged because Kits
already expose **Newest** using their publication timestamp.

## Chosen Approach

Add a new project browse-sort value, `date-added`, backed by the existing
generated `CatalogProject.catalogedAt` field.

Alternatives were rejected for the following reasons:

- Repurposing `recent` would silently change the established Recent Activity
  contract.
- Treating the existing New view as sufficient would only expose projects from
  the last 30 days and would exclude the seed cohort rather than sort the full
  result set.

No registry migration, generated-catalog migration, snapshot change, or project
card change is required.

## Behavior

- The project sort control adds **Date Added** alongside the existing options.
- Selecting it produces `sort=date-added` in the URL.
- Projects sort by `catalogedAt` descending.
- Equal timestamps sort by locale-aware project name, then stable project ID.
- Category, tag, frontend, license, development, relationship, and other filters
  continue to run before sorting.
- Starting or changing a meaningful search still switches the active sort to
  Relevance.
- Clearing search restores the remembered Date Added browse sort when that was
  the user's prior project sort.
- Invalid or unsupported `sort` query values continue to fall back to Recent
  Activity.
- Recent Activity, Sustained Activity, Popularity, Alphabetical, and all Kit
  sorts retain their current behavior.

## Data Semantics

`catalogedAt` is generated from required canonical project field
`cataloged_at`, defined as the time Tavernary accepted and published a project.
It is not repository creation time, latest commit time, latest release time, or
snapshot refresh time.

The initial seed cohort was imported together and many seed records share the
same timestamp. Those records therefore use the documented name and ID
tie-breaks. The feature must not invent historical dates or substitute source
activity for those ties.

## Implementation Boundaries

The change is limited to the existing project-sort seams:

- Extend the project browse-sort type and accepted sort set.
- Add a Date Added comparator branch using the existing fallback ordering.
- Add the Date Added option to the project toolbar.
- Update focused query, selector, toolbar, and search-transition coverage.

The generated catalog schema and canonical project schema remain unchanged.

## Verification

Use test-driven development:

1. Add failing tests for descending timestamp order, deterministic ties, URL
   parsing/serialization, toolbar selection, and search restoration.
2. Implement the smallest query, selector, and toolbar changes that pass them.
3. Run the focused unit tests.
4. Run the repository's full `npm.cmd run check` gate.

Success means Date Added is selectable and URL-addressable, orders real project
catalog data by `catalogedAt`, preserves established search transitions, and
does not alter any existing project or Kit sort.
