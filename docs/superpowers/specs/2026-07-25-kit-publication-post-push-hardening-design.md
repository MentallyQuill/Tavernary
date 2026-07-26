# Kit Publication Post-Push Hardening

## Problem

The Kit publication workflow currently pushes a validated registry change before
updating the source issue. If the optional `kit-published` label is missing or
GitHub issue metadata is temporarily unavailable, the issue-label step fails the
job and prevents the explicit Pages deployment dispatch. This reports a false
publication failure even though the canonical Kit record is already on `main`.

Pushes made with the workflow token cannot be treated as the deployment trigger.
The publication workflow must explicitly dispatch `deploy-pages.yml` with the
exact commit SHA it pushed.

## Success Contract

A Kit publication is successful when:

1. The approved issue is fetched and validated.
2. The canonical Kit record is applied.
3. Catalog validation, catalog generation, and tests pass.
4. The resulting commit is rebased and pushed to `main`.
5. `deploy-pages.yml` accepts a dispatch for that exact pushed commit.

Failures in any of those stages must keep the publication action red.

Updating issue metadata is bookkeeping, not publication. Failure to create or
apply the `kit-published` label must emit a visible workflow warning without
changing the successful publication result.

## Workflow Design

After the commit/rebase/push step:

1. Dispatch `deploy-pages.yml` immediately with the commit SHA exposed by the
   commit step.
2. Attempt to ensure that the repository label `kit-published` exists.
3. Attempt to add `kit-published` to the approved issue.
4. Convert failures from either label operation into explicit workflow warnings
   and exit the bookkeeping step successfully.

Deployment remains a separate GitHub Actions run. The publication workflow
guarantees that the exact deployment was requested; the Deploy Pages workflow
continues to report its own build or deployment failure independently.

## Error Semantics

| Failure | Publication result | Deployment requested |
| --- | --- | --- |
| Validation, tests, commit, rebase, or push fails | Failure | No |
| Exact-SHA deployment dispatch fails | Failure | No |
| Label creation or issue labeling fails | Success with warning | Yes |
| Deploy Pages later fails | Publication remains successful; deployment run fails | Yes |

## Test Coverage

Focused workflow tests will verify that:

- exact-SHA deployment dispatch occurs before issue bookkeeping;
- deployment dispatch remains a required step;
- the bookkeeping step ensures `kit-published` before applying it;
- label-management failures produce workflow warnings and do not return a
  failing status.

The focused workflow suite and the full repository check must pass before
handoff.

## Scope

This change only hardens the approved Kit publication workflow. It does not
change Kit validation, maintainer approval, withdrawal behavior, Pages build
logic, or unrelated project-submission automation.
