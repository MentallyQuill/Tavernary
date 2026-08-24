# Durable Project Validation Reconciliation Design

## Problem

Tavernary admits project submissions, generates an exact Publisher-owned branch, opens a review PR, and dispatches an exact-head validation run. Publication is safe but one-shot: if that trusted validation fails or a later publication attempt becomes stale, no durable controller guarantees another eligible action. The issue remains open with review-oriented labels even when no human decision is actually pending.

The current pipeline also launches a full pull-request validation and a full exact-head validation for the same generated commit. Only the exact-head `workflow_dispatch` run is publication authority. The two runs can disagree because global visual and performance gates contain runner-sensitive checks. Meanwhile, other Publisher workflows can advance `main`, forcing an otherwise valid transaction to regenerate and begin validation again.

## Goals

- Every automatic generated project transaction eventually reaches one explicit state: validating, retrying, publishing, blocked with a diagnostic, or published.
- GitHub remains the authoritative queue. Recovery derives state from the current Publisher-authored PR head, schema-2 transaction marker, Actions runs, and issue lifecycle rather than a mutable repository queue file.
- A failed or missing exact-head validation is retried automatically up to a bounded limit for that exact head.
- A successful validation is handed to Publisher exactly once when possible and safely reconciled when the original handoff is missing or failed.
- A stale transaction can regenerate and re-enter validation without manual dispatch.
- The issue and PR clearly show the current automated state and the exact blocking run.
- Malicious-contributor protections, generated-path restrictions, exact-head binding, and Publisher App merge authority remain intact.
- Validation gates remain meaningful while eliminating vocabulary collisions and single-sample runner noise.

## Non-goals

- Automatically accepting transactions whose `publication_mode` is `manual`.
- Giving write permissions or secrets to pull-request code.
- Weakening generated-path, source-identity, actor-authority, or exact-SHA validation.
- Automatically rewriting submitted metadata to satisfy catalog policy.
- Serializing every repository maintenance workflow behind one global lock.

## Architecture

### Derived controller state

A new reconciliation module enumerates open PRs whose head branch begins with `automation/project-submission-` or `automation/project-owner-request-`. A candidate is eligible only when all of the following are true:

- the PR head repository is Tavernary itself;
- the PR author is the configured Tavernary Publisher App bot by immutable numeric ID and Bot type;
- the PR base is the default branch;
- the PR body contains a valid schema-2 project publication transaction;
- the transaction's generated branch and head SHA match live GitHub state;
- the source issue remains open and admitted on the producer-specific route, and its immutable author identity matches the transaction actor; and
- the transaction uses automatic publication.

For each eligible current head, the controller loads exact-head `Site: Validate changes` runs whose event is `workflow_dispatch`, Publisher runs associated with every successful validation run ID for that head, and issue-scoped regeneration runs launched by Publisher. It produces exactly one action:

- `wait`: an exact validation or Publisher run is queued or running;
- `validate`: no exact validation exists for the current head;
- `retry-validation`: the current head has fewer than three completed unsuccessful exact validations;
- `publish`: the current head has a successful validation, the normal CI handoff grace period has elapsed, and no Publisher run exists;
- `retry-publication`: Publisher failed transiently and its run attempt is below three;
- `regenerate`: Publisher previously completed without closing an automatic PR, no issue-scoped regeneration is active, and the current branch remains stale after the grace period;
- `block`: three validation, publication, or regeneration attempts for the current head have completed unsuccessfully; or
- `ignore`: the PR is manual, untrusted, malformed, closed, or no longer matches its transaction.

Attempts count GitHub Actions `run_attempt` values and are scoped to the current head SHA. Newer Publisher failures take precedence over older generation failures. Regeneration is requested through the Publisher workflow, which revalidates the transaction and uses its App token to dispatch the generator; the new generated head starts a fresh bounded recovery cycle.

### Triggering and concurrency

The controller runs from trusted default-branch code through:

- `workflow_run` completion for `Site: Validate changes`;
- a staggered 15-minute schedule; and
- owner/Publisher-only manual dispatch.

The workflow has one non-cancelling repository-wide reconciliation concurrency group. Before every action, the CLI re-reads the PR, source issue authority, validation runs, Publisher runs, and regeneration runs. It refuses to act if mutable trust state changed. Dispatches remain idempotent under overlapping workflow-run and scheduled wakeups, and a completed scan exits nonzero after reporting any candidate or required-projection error.

### Observability

The controller owns two labels:

- `submission-validation-retrying`: Tavernary is automatically retrying the current exact head.
- `submission-validation-blocked`: bounded automatic attempts are exhausted and the latest exact run requires intervention.

It maintains one issue comment with a machine-readable marker containing schema version, current head SHA, state, attempt count, and validation or publication run ID. The human-facing text links the exact run and says what Tavernary will do next. Head changes replace the projected state rather than stacking comments.

Terminal submission and owner-request lifecycle workflows remove reconciliation-owned labels and update only the Actions-bot-owned marker comment to a merged or declined terminal state. Foreign marker comments and retry history are preserved.

The controller also writes a commit status named `tavernary/publication-validation` so the generated PR shows the authoritative exact-head state even though publication is intentionally decoupled from pull-request permissions.

### Canonical validation

The explicit branch `workflow_dispatch` run remains the sole publication-authority validation. Pull-request runs remain read-only review feedback, but generated PRs use the focused content route instead of duplicating the complete cross-platform suite. The exact-head run retains static, unit, browser, scan, and visual coverage.

The existing CI success handoff remains the fast path. Reconciliation waits five minutes before repairing a missing handoff, preventing a duplicate Publisher dispatch while still recovering lost events.

### Deterministic validation gates

- Project-submission browser tests select checkboxes by exact accessible name so a new frontend such as `SillyTavern-AstraProjecta` cannot collide with `SillyTavern`.
- Tooltip visual tests wait for the computed global tooltip treatment before taking a screenshot. Unstyled or permanently incorrect tooltips still fail with a direct CSS diagnostic.
- TavernKeeper performance coverage keeps DOM, observer, listener, long-task, and relative-cost contracts. Frame-gap assertions compare feature-enabled views with the same-run feature-off control and retain a generous absolute safety ceiling, avoiding failure from one hosted-runner scheduling spike.
- Git-heavy unit tests use explicit operation-appropriate timeouts instead of Vitest's five-second UI-unit default; their exact repository-state assertions are unchanged.

## Security boundaries

- Reconciliation code is checked out from `main` and never from a generated branch.
- `workflow_run` does not execute contributor-controlled code with write permissions.
- The controller can dispatch existing trusted workflows, update issue projections, and write commit status; it cannot push generated content or merge directly.
- Only `publish-project-transaction.yml` retains Publisher merge and regeneration authority and revalidates Publisher PR authorship, the transaction actor, source identity, current inputs, changed paths, and exact validated head.
- Manual transactions remain awaiting maintainer action and are never converted to automatic mode by reconciliation.

## Verification

- Unit tests cover every planner action, `run_attempt` accounting, attempt reset on head change, multiple validation-to-Publisher paths, active/failed generation, malformed or foreign-authored PR rejection, revoked issue authority, handoff grace, and mutation-time stale-state refusal.
- Workflow contract tests cover triggers, permissions, concurrency, trusted checkout, and absence of secrets on PR validation.
- Regression coverage reproduces the overlapping frontend name, unstyled tooltip readiness, controlled runner slowdown, and slow Git fixtures.
- The complete static/unit/build gate and focused Playwright suites must pass before merge.
- After merge, the controller is manually dispatched once, all current automatic submissions are observed through exact-head validation and publication, the open issue/PR inventory is drained or explicitly blocked with diagnostics, Pages deploys the exact final main SHA, and the live catalog is verified.
