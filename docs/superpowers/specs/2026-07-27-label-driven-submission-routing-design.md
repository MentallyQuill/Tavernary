# Label-Driven Submission Routing Design

## Goal

Route every admitted Project and Kit submission into its normal validation
workflow without depending on the issue title.

## Problem

Issue admission and submission validation are separate workflows. Admission
adds `issue-admitted` with `GITHUB_TOKEN`, so GitHub does not emit a second
workflow event for that label mutation. The admission workflow therefore
dispatches the appropriate validator explicitly.

That explicit dispatch currently classifies submissions by title prefix.
Tavernary-created issues can have useful URL-based titles while retaining their
structured submission labels, so a valid issue can be admitted without matching
the legacy title prefix. The initial validation event then skips because
admission has not completed, and the explicit dispatch also skips because of the
title mismatch.

## Authority

Submission labels are the routing authority:

- `project-submission` routes to Project validation.
- `kit-submission` routes to Kit validation.
- Neither label means the issue is not a submission and requires no submission
  dispatch.
- Both labels are a routing conflict and must not dispatch either validator.

Labels select the validator only. The Project and Kit validation scripts remain
authoritative for issue state, body structure, source eligibility, duplicates,
review state, and publication.

## Architecture

`admit-issue.mjs` normalizes the event's string or object label representation
and exposes a `submission_type` output with one of four values:

- `project`
- `kit`
- `none`
- `conflict`

`admit-issue.yml` keeps the existing admission decision and dispatches exactly
one validator when an admitted issue has type `project` or `kit`. It does not
inspect the title. A non-submission issue remains a normal admitted issue and
does not dispatch submission automation. A conflicting issue fails closed and
emits an explicit workflow error rather than choosing a validator.

The event-driven Project and Kit validation workflows use their corresponding
submission label for routing. The Kit workflow drops its remaining title-prefix
guard. Manual `workflow_dispatch` remains an unconditional maintainer recovery
path for a specified issue number; the validator still fetches and verifies the
live issue before mutating submission state.

## Event Flow

1. GitHub opens or reopens an issue.
2. Admission applies the open-issue policy and writes `issue-admitted` when
   accepted.
3. Admission classifies the original structured submission labels.
4. Admission explicitly dispatches the matching validation workflow.
5. Validation fetches current issue state, validates the submission, and
   continues the existing Project review-PR or Kit publication lifecycle.

Edits to an already admitted submission continue to trigger its matching
validator. A maintainer can also dispatch either validator manually without
changing the issue title or body merely to generate an event.

## Error Handling

- `none` is expected for ordinary non-submission issues and performs no
  submission action.
- `conflict` produces a visible admission-workflow error and dispatches neither
  validator.
- A rejected admission dispatches nothing.
- Validator failures retain their existing labels, comments, artifacts, and
  retry behavior.
- Repeated valid dispatches remain protected by the existing per-issue
  concurrency groups and idempotent live-state checks.

## Verification

Focused unit coverage will prove:

- Project labels produce `submission_type=project`.
- Kit labels produce `submission_type=kit`.
- String and `{ name }` label representations normalize identically.
- Ordinary issues produce `none`.
- Conflicting Project and Kit labels produce `conflict`.
- Admission dispatch conditions use `submission_type`, never title prefixes.
- Project and Kit event-driven validators require their own submission label.
- Opened, reopened, edited, and manual-dispatch behavior retains the existing
  admission and validation guards.

The focused admission and workflow suites run first, followed by the repository's
complete static and unit checks. No live test issue is required because issue
#72 and its successful manual recovery already demonstrate the production
failure and expected downstream lifecycle.

## Scope

Expected implementation files:

- `scripts/submissions/admit-issue.mjs`
- `scripts/submissions/admit-issue.d.mts`
- `.github/workflows/admit-issue.yml`
- `.github/workflows/triage-kit-submission.yml`
- `tests/unit/admit-issue.test.ts`
- `tests/unit/workflows.test.ts`

No issue form, submission builder, catalog schema, generated project record, or
publication behavior changes are included. Existing unrelated worktree changes
must remain untouched.
