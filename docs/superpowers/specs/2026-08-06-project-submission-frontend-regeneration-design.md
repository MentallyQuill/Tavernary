# Project Submission Frontend Regeneration Design

## Problem

Regenerating an existing automated frontend-submission pull request can preserve
the pull request's previously generated frontend vocabulary entry. The generator
then interprets that entry as a collision and appends a second owner-suffixed
entry with the same visible label. Content browser tests fail because two filter
checkboxes have the same accessible name.

## Design

The project-submission workflow will restore
`data/vocabularies/frontends.json` from `origin/main` whenever it regenerates an
existing generated pull request. This reset will not depend on the previous pull
request marker listing the shared vocabulary file.

The workflow's existing maintainer-correction guard remains authoritative: an
existing generated branch whose remote SHA differs from its transaction marker
is rejected before regeneration unless forced. Resetting the vocabulary therefore
discards only automation-owned proposal state, while preserving the current
canonical vocabulary from `main`.

The generator's existing collision behavior remains unchanged. If current
`main` genuinely contains a different frontend with the same ID or label, the
generator will still create a source-disambiguated ID.

## Testing

A workflow regression test will require the unconditional vocabulary reset in
the existing-PR regeneration branch and prove it occurs outside the loop over
marker-declared generated paths. Existing workflow, project-submission, content,
and browser-smoke checks will verify that normal generation and catalog behavior
remain valid.

## PR #332 Recovery

After the systemic fix is verified, PR #332's generated branch will be repaired
so it contains a single `PocketRisu` vocabulary entry referenced by the project
record. Its required GitHub Actions checks will be observed through completion.

## Scope

This change does not alter general vocabulary collision semantics, catalog UI,
submission metadata, or unrelated TavernKeeper work.
