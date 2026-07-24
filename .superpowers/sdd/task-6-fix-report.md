# Task 6 Fix Report

Date: 2026-07-24
Task: project-card Task 6 review follow-up
Status: Complete

## Scope completed

- Fixed the Task 6 project-card regression only.
- Preserved known community and repository-size facts when activity metrics are missing.
- Kept unavailable copy limited to the missing metric instead of blanketing the whole development row.
- Added focused mixed-state coverage for missing activity with known repository facts.
- Added direct `sourceStatus: "pending"` coverage to prove the pending label renders without inventing other missing facts.

## Tests and build

- `npm.cmd test -- tests/unit/project-card.test.tsx`
  - Result: passed, 1 file and 5 tests.
- `npm.cmd run build`
  - Result: passed.
  - Notes: Next.js emitted the existing multi-lockfile workspace-root warning for `F:\git\Tavernary\package-lock.json` and `F:\git\Tavernary\.worktrees\full-catalog-launch\package-lock.json`, but the build completed successfully.

## Self-review notes

- Root cause was the non-preset fallback branch replacing the entire development row when activity metrics were absent.
- The fix keeps the non-preset development row intact and downgrades only the activity portion to `Activity unavailable`.
- No unrelated Task 6 selector, filter, or data behavior was changed.

## Concerns

- No known remaining blockers from the focused project-card suite or the required build.
