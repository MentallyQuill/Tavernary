# Dispatch-Only Issue Routing Design

## Goal

Prevent unrelated GitHub issue activity from creating skipped Project
validation, Kit validation, and Kit withdrawal workflow runs.

## Routing Authority

The issue templates' structured labels select exactly one route:

- `project-submission` -> Project validation
- `kit-submission` -> Kit validation
- `kit-withdrawal` -> Kit withdrawal
- no routing label -> no worker dispatch
- more than one routing label -> fail closed

Titles are presentation only and never select automation.

## Architecture

`admit-issue.yml` becomes the single event-facing issue router. It listens for
`opened`, `reopened`, and `edited`.

For opened or reopened issues, `admit-issue.mjs` applies the existing open-issue
admission policy before routing. For edited issues, it does not rerun admission;
it reads the issue's current `issue-admitted` label and state. The script emits
`admitted`, `issue_number`, and `route`.

The workflow dispatches one matching worker only when the issue is open and
admitted. A conflicting route emits an error and dispatches nothing.

These workers become manual-dispatch-only:

- `triage-submission.yml`
- `triage-kit-submission.yml`
- `apply-kit-withdrawal.yml`

Their existing per-issue validation and concurrency remain authoritative.
Kit withdrawal accepts an `issue_number`, fetches the live issue from GitHub,
then verifies the structured withdrawal label and numeric author identity
before writing a tombstone.

## Event Flow

1. An issue opens or reopens.
2. Intake applies admission policy and reads routing labels.
3. Intake dispatches at most one worker.
4. An admitted issue edit returns to intake, which routes from current labels
   without changing admission.
5. The worker re-fetches and validates current issue state before mutation.

Manual worker dispatch remains available for maintainer recovery.

## Failure Handling

- Ordinary issues complete intake successfully without dispatch.
- Closed or non-admitted edited issues do not dispatch.
- Conflicting routing labels fail visibly and dispatch nothing.
- A missing or invalid withdrawal issue fails before catalog mutation.
- Worker failures retain their existing retry and concurrency behavior.

## Verification

Tests must prove:

- all supported label representations classify consistently;
- conflicts fail closed;
- edited issues preserve admission state without admission API writes;
- intake owns all issue event triggers;
- all three workers are `workflow_dispatch`-only;
- intake dispatches each worker by route;
- withdrawal re-fetches the requested live issue;
- existing withdrawal author and tombstone checks remain intact.

Run focused admission, workflow, and withdrawal tests first, followed by the
repository's complete check command.

## Scope

No issue forms, catalog schemas, publication rules, review-PR behavior, or UI
behavior change. The existing label-driven routing documents remain historical
design context; this design supersedes their event-trigger architecture.
