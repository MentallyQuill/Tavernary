# Task 6 Report

Date: 2026-07-24
Task: Query, Filters, and Public Card States
Status: Complete
Commit: `feat(catalog): add uncategorized public states`

## Scope completed

- Added `uncategorized` as a public category/query option.
- Kept selector ordering deterministic with alphabetical name then id tiebreaks.
- Aligned development filter facet counts with selector semantics.
- Preserved pending licenses inside the missing-license filter contract.
- Updated public card state rendering for provisional, pending, manual, stale,
  and unavailable fact states.
- Added focused query/filter/card tests for the Task 6 behaviors.

## Tests and build

- `npm.cmd test -- tests/unit/catalog-selectors.test.ts tests/unit/catalog-license-filter-contract.test.tsx tests/unit/project-card.test.tsx`
  - Result: 3 files passed, 14 tests passed.
- `npm.cmd run build`
  - Result: passed.
  - Notes: Next.js emitted an existing workspace-root warning about multiple
    lockfiles (`F:\git\Tavernary\package-lock.json` and this worktree
    `package-lock.json`), but the production build completed successfully.

## Self-review notes

- Kept changes contained to Task 6 surfaces: catalog query, selectors, filter
  panel, project card UI/styles, supporting icon typing, and focused unit tests.
- Avoided touching unrelated task files or workflow code.
- Verified the extension/manual-source card path no longer falls into the
  preset-only metrics branch when activity data is missing.
- Verified provisional/manual/stale states stay visible without fabricating
  activity, release, popularity, or repository-size values.

## Concerns

- The card now shows explicit unavailable-state copy only when the project is
  provisional or the source status is not healthy. That keeps healthy curated
  cards quieter while still surfacing the required honesty states for Task 6.
- The existing Next.js workspace-root warning is still present and appears
  unrelated to Task 6.
