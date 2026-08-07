# Project Submission Frontend Regeneration Design

## Problem

Regenerating an existing automated frontend-submission pull request can preserve
the pull request's previously generated frontend vocabulary entry. The generator
then interprets that entry as a collision and appends a second owner-suffixed
entry with the same visible label. Content browser tests fail because two filter
checkboxes have the same accessible name.

## Design

The project-submission workflow will recreate its automation-owned branch from
`origin/main` whenever it regenerates an existing generated pull request. The
workflow will not rebase stale generated history before cleanup, so a legitimate
overlapping vocabulary change on `main` cannot cause a conflict before the
generator runs.

The workflow's existing maintainer-correction guard remains authoritative: an
existing generated branch whose remote SHA differs from its transaction marker
is rejected before regeneration unless forced. Recreating the branch therefore
discards only automation-owned proposal state, while preserving the current
canonical catalog and vocabulary from `main`.

The generator's existing collision behavior remains unchanged. If current
`main` genuinely contains a different frontend with the same ID or label, the
generator will still create a source-disambiguated ID.

## Testing

A temporary-repository regression test will create stale generated history and a
conflicting canonical vocabulary change, then prove regeneration resets the
branch directly to `origin/main` without rebasing. A workflow regression test
will require that tested reset command before marker-scoped cleanup. Existing
workflow, project-submission, content, and browser-smoke checks will verify that
normal generation and catalog behavior remain valid.

## PR #332 Recovery

After the systemic fix is verified, PR #332's generated branch will be repaired
so it contains a single `PocketRisu` vocabulary entry referenced by the project
record. Its required GitHub Actions checks will be observed through completion.

## Scope

This change does not alter general vocabulary collision semantics, catalog UI,
submission metadata, or unrelated TavernKeeper work.
