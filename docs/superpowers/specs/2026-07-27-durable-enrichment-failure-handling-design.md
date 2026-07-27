# Durable Enrichment Failure Handling Design

## Problem

The enrichment workflow currently makes one provider request during preflight.
A single 120-second timeout aborts the workflow before any pending project is
processed, even though timeouts are transient and project records can safely
remain provisional.

GitHub Actions also has no distinct "success with warnings" conclusion. Without
another durable signal, allowing handled project failures to finish green
would make those failures easy to miss.

## Run Contract

An enrichment run succeeds when it safely processes and records the outcome of
every selected project. It does not require every project to become enriched.

The full rollout has three terminal conclusions:

- `complete`: every selected project was resolved.
- `complete-with-errors`: the workflow completed safely, but one or more
  projects remain provisional after their retries.
- `failed`: a systemic problem prevented trustworthy processing, persistence,
  publication, deployment, or error reporting.

Both `complete` and `complete-with-errors` produce a successful GitHub Actions
conclusion. `failed` produces a failed conclusion. A full rollout with only
isolated terminal project errors is `complete-with-errors` even when no project
was enriched.

The stricter canary success threshold remains unchanged because the canary
authorizes publication. Canary requests still receive the transient retry
behavior described below.

## Provider Preflight

Keep preflight as a fast way to detect invalid provider configuration before
catalog work begins, but do not let the first transient failure abort the run.

Each preflight provider request, including a validation-repair request,
receives up to three retries, for four total attempts. Retries use delays of
5, 15, and 30 seconds. Retry these provider failure classes:

- timeout;
- network failure;
- rate limiting; and
- provider server errors.

Configuration errors, authentication failures, model mismatches, malformed
provider responses, and other non-transient contract failures remain immediate
systemic failures. Exhausting all preflight attempts is also a systemic
failure. In either case, fail the Action rather than sending the entire catalog
through a provider that has not demonstrated availability.

The 120-second deadline remains a per-request safety bound. Make the deadline
configurable while retaining 120 seconds as the default. The workflow-wide
deadline remains five hours.

## Project Processing

After preflight succeeds, preserve the existing bounded-concurrency batch and
durable retry paths.

A project-level timeout or other isolated failure:

1. records the failed primary attempt;
2. enters the existing retry queue;
3. remains provisional if its retry also fails;
4. is recorded as a terminal project error; and
5. does not stop later projects or fail the full rollout.

Systemic project failures such as invalid credentials, an unexpected model,
corrupted run state, or a failed catalog write continue to stop the rollout.
Publication and deployment failures also remain fatal.

## Action Feedback

Every `complete-with-errors` run emits GitHub Actions warning annotations and
keeps the existing sanitized unresolved-project table in the job summary.
Warnings include project IDs, terminal outcome, stable reason codes, and safe
diagnostic messages. They never include provider payloads, README content,
credentials, or other untrusted text.

After a successfully completed full rollout, synchronize one rolling GitHub
issue titled `Catalog enrichment errors` with the dedicated
`catalog-enrichment-errors` label. Ensure the label exists idempotently before
searching for or changing the issue.

- Create the issue only when terminal unresolved projects exist.
- Update the existing open issue instead of creating an issue per run.
- Include the latest run link, timestamp, unresolved project IDs, outcomes,
  reason codes, and sanitized details.
- Exclude first-attempt failures that later succeeded and projects excluded by
  manual-enrichment policy.
- Close the issue when a later successfully completed full rollout has no
  unresolved projects.
- Do not close or replace the issue from a systemically failed run because that
  run did not complete a trustworthy reconciliation.

The workflow receives only the additional `issues: write` permission needed to
synchronize this issue. Failure to synchronize the issue is a systemic
workflow failure because durable notification is part of the run contract; the
Action summary remains available for diagnosis.

## Verification

Add focused tests proving:

- one transient preflight timeout retries and can recover;
- preflight uses at most four total attempts with the specified delays;
- exhausted transient retries fail systemically;
- non-transient preflight failures do not retry;
- the provider timeout is configurable and defaults to 120 seconds;
- isolated terminal project errors produce `complete-with-errors`, including
  a run with zero enriched projects;
- systemic, publication, and deployment failures still fail the Action;
- partial runs emit sanitized warnings;
- unresolved projects create or update one rolling issue;
- a clean completed run closes that issue;
- a systemically failed run does not close it; and
- issue content cannot expose raw provider output or source text.

Run the focused enrichment provider, run-state, orchestrator, workflow-safety,
and issue-reporting tests before the complete repository check.

## Out of Scope

This change does not alter enrichment prompts, catalog vocabularies, project
selection, batch size, concurrency, manual-enrichment policy, or canary
approval thresholds.
