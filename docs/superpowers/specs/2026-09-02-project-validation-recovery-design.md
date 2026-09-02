# Project Validation Recovery Design

## Problem

Tavernary's generated project publication controller is durable once it is awake, but the fast wake path is success-only. The exact-head `Site: Validate changes` workflow dispatches `reconcile-project-validations.yml` only when both `verify` and `visual` succeed. A failed exact-head run therefore depends on a nested `workflow_run` event or the scheduled sweep. GitHub does not reliably cascade workflow-run events from workflows launched by other workflows, and scheduled runs may be delayed substantially. The result is a generated issue that appears stuck even though the controller already knows how to retry or block it.

The current reconciliation workflow also waits for an explicitly supplied validation run with `gh run watch --exit-status`. That command returns failure for an unsuccessful validation and prevents the reconciliation command from running. This is correct for a validation gate but wrong for a controller whose job is to inspect and react to either conclusion.

Issues #656 and #658 exhausted three exact-head attempts on the same repository-wide visual regression: the three fork-relationship snapshots differed only around the `11d ago` label. The visible text was frozen, but its inline commit-freshness color input still depended on mutable snapshot dates. The card layout, dimensions, responsive behavior, and submission data were unchanged. One #658 attempt also narrowly missed a performance threshold, but the unchanged clean-main performance suite passes well inside the budget, so that one result is runner noise rather than the shared cause.

Issue #653 reports that `twitter/twemoji` is not a SillyTavern project. The report admission and triage workflows completed, but project reports are advisory and do not mutate the catalog. The current source remains active and the incorrect project remains published.

## Goals

- Every trusted generated exact-head validation wakes reconciliation directly, whether it succeeds, fails, or is cancelled.
- Reconciliation always waits for the specified run to become terminal, then evaluates its conclusion through the existing controller.
- The scheduled and `workflow_run` triggers remain as recovery paths.
- The visual fixture remains strict while stabilizing both visible age text and its freshness-color input.
- Twemoji leaves normal catalog discovery without deleting its project, source, snapshot, or Kit history.
- Existing generated-branch custody, exact-SHA validation, retry limits, Publisher App merge authority, and publication serialization remain unchanged.
- #656 and #658 are regenerated from the repaired `main` and processed serially to terminal publication.

## Non-goals

- Increasing screenshot tolerances or weakening layout assertions.
- Loosening TavernKeeper performance budgets because of one hosted-runner outlier.
- Auto-resolving arbitrary project reports without a maintainer-reviewed catalog mutation.
- Deleting Twemoji from historical Kit records or rewriting repository history.
- Allowing generated-branch code to gain write permissions or publication authority.

## Design

### Outcome-complete validation handoff

The `reconcile-generated-validation` job remains an `always()` job dependent on `verify` and `visual`, restricted to `workflow_dispatch` runs on the two trusted generated branch prefixes. Its condition no longer requires either dependency to succeed. The job has only `actions: write` and `contents: read` and asynchronously dispatches the trusted `main` reconciliation workflow with the current validation run ID.

This preserves the existing security boundary: generated code cannot modify issues, statuses, pull requests, or repository contents. It can only cause trusted default-branch reconciliation code to inspect the completed run and derive the next action.

### Conclusion-neutral waiting

The dispatched reconciler may start before the handoff job has exited, so it still waits for the supplied run ID. The wait command omits `--exit-status`; completion, not success, is the precondition. The following reconciliation step then inventories the exact run and invokes the existing bounded planner, which can publish a success, retry a failure, or project a blocked state after the third unsuccessful attempt.

The controller remains serialized by `project-validation-reconciliation`, and its scheduled and `workflow_run` triggers stay intact for missed or delayed dispatch recovery.

### Deterministic fork-relationship fixture

Concurrent PR #661 supplied the more precise visual repair while this work was in review. It keeps the distinct `2d ago` and `11d ago` text, freezes the matching `--commit-freshness` values, retains the existing strict pixel allowance, and leaves all screenshot bytes unchanged. This branch integrates and preserves that verified fix rather than replacing it with a broader snapshot refresh. No production CSS or layout changes are involved.

### Twemoji tombstone

The source record `github-26291683` will use the repository's established source lifecycle:

- `status: delisted`
- `status_reason: removed`
- `refresh_policy: paused`

The project record remains as the historical card identity. Catalog construction already excludes projects whose sources are delisted. Published Kits continue to reference `twitter-twemoji`; their generated components become unavailable with no canonical link, which preserves what Kit authors selected without silently rewriting their Kits.

A production-data regression test will bind this maintenance decision to the source tombstone, absence from public projects, and continued unavailable Kit components.

## Recovery sequence

1. Merge the workflow and Twemoji maintenance change on top of the verified fixture repair after full local and GitHub verification.
2. Verify Pages deploys the exact merge SHA and Twemoji is absent from normal project discovery while its two Kits remain readable with an unavailable component.
3. Regenerate #656 from current `main` using the normal guarded generator and follow its exact-head validation, publication, issue closure, Pages deployment, and live card.
4. Repeat for #658 only after #656 is terminal, avoiding avoidable base drift between generated transactions.
5. Confirm no generated submission remains in retrying or blocked state because of the repaired repository-wide fixture.

## Verification

- Workflow contract tests prove failed and skipped dependency outcomes still reach the handoff job and that the reconciler wait is conclusion-neutral.
- The production catalog test proves Twemoji's source is tombstoned, its project is not public, and historical Kit components are unavailable.
- The three fork-relationship visual snapshots pass without changing snapshot bytes or raising `maxDiffPixels`.
- `npm.cmd run check`, `npm.cmd run test:visual`, and `npm.cmd run test:scan-e2e` pass from the isolated worktree.
- PR checks pass at the exact repair head, the PR is merged without bypassing checks, and Pages deploys the exact merge SHA.
- #656 and #658 each complete from a fresh generated head and appear in the live catalog.

## Rollback

The workflow behavior can be reverted independently by restoring the success predicates and `--exit-status`, although doing so restores the original liveness gap. Twemoji can be republished by restoring the source to `active`, clearing `status_reason`, and setting `refresh_policy` to `automatic`; its preserved project and Kit records make that reversible. The independently merged fixture repair remains test-only and can be reverted separately if necessary.
