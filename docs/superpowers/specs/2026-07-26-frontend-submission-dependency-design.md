# Frontend Submission Dependency Design

**Date:** 2026-07-26
**Status:** Approved

## Goal

Require every frontend claimed by an Extension or frontend-dependent System
Preset to complete Tavernary's normal frontend submission and maintainer review
before the dependent project can advance to review.

When a project references an unindexed frontend, Tavernary keeps the project
issue open, explains the prerequisite, and retries the same issue automatically
after the frontend is merged.

## Policy

- An Extension must declare at least one supported frontend.
- A frontend-dependent System Preset must declare at least one supported
  frontend.
- A frontend-independent System Preset remains exempt after the contributor
  explicitly marks it independent.
- Every claimed frontend must already resolve to a Tavernary frontend. One
  resolved frontend does not excuse another unresolved frontend.
- An unknown frontend never creates a frontend record, vocabulary entry, issue,
  or pull request automatically.
- The missing frontend must be submitted separately as a `Frontend` project and
  complete the ordinary maintainer-reviewed pull-request flow.
- The dependent issue remains open until all claimed frontends resolve.

This prevents contributors from introducing arbitrary frontend identities
through Extension or Preset submissions while preserving their original
project submission for later review.

## Submission Experience

The Tavernary submission builder remains the primary intake surface.

For Extensions and frontend-dependent System Presets:

- render the searchable multi-select populated from Tavernary's current
  frontend catalog;
- select no frontend by default;
- require the contributor to make an explicit selection;
- allow multiple known frontends because compatibility is not singular; and
- retain **Other or not listed** for reporting a missing frontend dependency.

Selecting **Other or not listed** reveals required fields for:

- frontend name; and
- exact public GitHub repository URL.

The unknown frontend is included in the project manifest as a claimed
dependency. It allows the public project issue to be created, but it does not
satisfy admission. The submission action remains the authoritative gate.

The native GitHub fallback form retains free-text supported-frontends input
because GitHub Issue Forms cannot populate dynamic choices or reveal
conditional fields. The same server-side reconciliation policy applies to both
intake paths.

## Dependency Classification

Frontend reconciliation distinguishes unresolved frontend dependencies from
generic malformed input.

For every submitted frontend, reconciliation attempts the existing controlled
resolution sequence:

1. exact frontend ID or label match;
2. controlled alias match;
3. canonical frontend repository URL match; and
4. an unambiguous close-match correction.

If a submitted frontend still does not resolve:

- a valid public GitHub repository URL produces a structured missing-frontend
  dependency;
- an absent or invalid URL produces a normal correction request asking for the
  exact public repository URL; and
- the entire project submission receives `needs-information`, even when other
  claimed frontends resolve.

The structured dependency includes the submitted name and normalized canonical
repository identity. Comment prose is never parsed to recover dependency
state.

## Issue Response

The triage action keeps the dependent project issue open and updates its stable
automation comment. For a missing frontend such as Aikobots, the response
communicates:

> **Aikobots is not currently indexed as a Tavernary frontend.**
>
> Extensions and presets can only reference frontends that have completed
> Tavernary review. Submit Aikobots as a frontend first. This issue will remain
> open and retry automatically after that frontend is merged.

The frontend-submission instruction links directly to Tavernary's project
submission flow and tells the contributor to choose `Frontend`. If the
submission flow later supports safe query-prefilled project types, the link may
prefill `Frontend`; the dependency contract does not require that enhancement.

When several frontends are missing, the comment lists each dependency
separately and makes clear that all must be merged before the project can
advance.

The issue retains:

- `project-submission`;
- `issue-admitted`; and
- `needs-information`.

It does not receive `needs-maintainer-review`, and no project review pull
request is generated while a frontend dependency remains unresolved.

## Persisted Dependency State

The stable Tavernary project-submission state marker stores unresolved frontend
dependencies as structured data. Each entry contains enough canonical identity
to compare it with a newly cataloged frontend without relying on mutable
display names.

The marker remains versioned and backward compatible with existing markers
that do not contain dependency data. Re-triaging an older issue recreates the
dependency list from its manifest.

Repeated triage is idempotent:

- the stable automation comment is updated rather than duplicated;
- dependency entries are replaced with the current reconciliation result;
- resolved dependencies disappear from the marker; and
- labels reflect the latest complete result.

## Targeted Automatic Retry

When a frontend catalog change reaches `main`, a focused workflow checks open
project submissions that are waiting on frontend dependencies.

The workflow:

1. derives the canonical repository identities of currently indexed
   frontends;
2. queries open `project-submission` issues carrying `needs-information`;
3. reads their structured dependency markers;
4. selects only issues whose missing dependency now resolves;
5. reruns ordinary project triage for those issues; and
6. lets the existing idempotent triage and pull-request generation paths handle
   the outcome.

The retry trigger is limited to merged changes that can affect frontend
identity, including canonical frontend records and the frontend vocabulary. It
does not rerun every blocked submission after unrelated catalog changes.

If an issue depends on multiple unknown frontends, a partial match may trigger
reconciliation, but the issue remains blocked until every dependency resolves.
Temporary GitHub API failures retain the issue and dependency marker for a
later retry.

## Issue #23 Outcome

Issue #23 claims compatibility with both SillyTavern and the currently
unindexed Aikobots frontend.

Under this design:

1. SillyTavern resolves normally.
2. Aikobots becomes a structured missing-frontend dependency.
3. Issue #23 remains open with an actionable prerequisite comment.
4. Aikobots must be submitted separately as a Frontend.
5. Merging the reviewed Aikobots frontend triggers targeted reconciliation.
6. Issue #23 advances automatically once every claimed frontend resolves.

## Error Handling

- A missing frontend URL asks the contributor for an exact public GitHub
  repository URL.
- A malformed, private, deleted, or unreachable frontend repository follows
  the existing source-validation and retryable-failure policies.
- Ambiguous alias or close matches remain correction requests and never become
  dependency identities automatically.
- Closing or declining the frontend submission leaves the dependent issue open
  and blocked; Tavernary does not treat an unmerged frontend as indexed.
- A manually closed dependent issue is not reopened by the retry workflow.

## Verification

### Unit coverage

- Extensions and dependent Presets require explicit frontend selection.
- No frontend is selected by default.
- Multiple known frontends remain supported.
- An unknown frontend with a valid GitHub URL becomes a structured dependency.
- Any unknown claimed frontend blocks admission, even alongside known
  frontends.
- Missing or invalid unknown-frontend URLs produce correction errors.
- Dependency comments contain the prerequisite explanation and submission link.
- Stable markers serialize, replace, and clear dependency data idempotently.

### Workflow coverage

- A merged frontend retries only matching open blocked issues.
- Unrelated catalog changes do not cause a broad retry sweep.
- Multiple dependencies remain blocked until all resolve.
- Already closed issues are ignored.
- Repeated merge or workflow events do not duplicate comments or review pull
  requests.

### Browser coverage

- Extension and dependent-Preset forms start with zero selected frontends.
- Submission without a frontend is blocked locally.
- **Other or not listed** reveals required name and repository fields.
- The generated issue manifest preserves known and unknown frontend claims.

### Live completion proof

Use a controlled missing-frontend submission to prove:

1. the dependent issue stays open with `needs-information`;
2. the action posts the actionable prerequisite response;
3. no dependent-project pull request exists before the frontend merge;
4. merging the frontend triggers targeted retry; and
5. the original dependent issue proceeds through its normal generated pull
   request without resubmission.

## Out of Scope

- Automatically creating a frontend submission from a dependency claim.
- Publishing an unknown frontend through an Extension or Preset pull request.
- Allowing a free-text frontend name to satisfy compatibility.
- Closing and recreating the dependent project issue.
- Requiring contributors to manually retry after a successful frontend merge.
- Replacing Tavernary's multi-select with a singular frontend dropdown.
