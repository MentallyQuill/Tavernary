# Project Generation Failure Recovery

## Status

Approved in conversation on 2026-07-30.

This design supersedes only the metadata-selection behavior in
`2026-07-29-tavernary-authoritative-github-review-mirror-design.md` that made
editing owner summary text or tags automatically select manual policy. All
other manifest-authority, owner-authority, exact-path, and publication
contracts remain in force.

## Problem

Project owner request #166 passed issue admission and repository-owner
verification twice, then failed before creating a review pull request. Its
changed manual summary entered catalog-copy preservation, but both the initial
provider response and the repair response violated the strict copy contract.
The workflow stopped before validation, commit, push, pull-request creation,
CI dispatch, or publication.

The issue retained `needs-maintainer-review` even though there was no review
pull request. The generation workflow synchronizes success state but has no
terminal failure reconciliation.

Project submission #167 subsequently passed intake and failed a different
catalog-copy constraint. This confirms that provider-output drift is an
automation-wide failure mode rather than an issue-166-specific content
rejection.

The owner builder also made manual metadata intent ambiguous. Editing summary
text or tags automatically selected manual policy, so a manifest could request
manual ownership without the owner deliberately selecting it.

## Goals

- Require an explicit owner choice before summary or tag metadata becomes
  manual.
- Keep strict provider-output validation and one bounded repair attempt.
- Never invent, zero-fill, or silently accept invalid automatic metadata.
- Allow a verified owner-authored manual summary to reach a review pull request
  when provider review is unavailable, without allowing it to auto-merge.
- Reconcile issue state after every non-cancelled generation failure.
- Give contributors and maintainers a sanitized, idempotent failure notice and
  a clear retry state.
- Repair and rerun issue #166 after the workflow fix is deployed.

## Non-goals

- Replacing contextual catalog-policy review with a hardcoded moderation list.
- Automatically merging copy that did not complete contextual review.
- Treating a community-submitted description as authoritative catalog copy.
- Weakening repository-owner identity checks, manifest authority, fingerprints,
  vocabulary hashes, exact generated paths, branch ownership, or exact-head
  publication.
- Making provider failures look like successful copy review.
- Changing automatic repository refresh behavior.

## Owner Metadata Intent

Editing owner summary text or controlled tags no longer changes metadata mode.
The current mode remains selected until the owner deliberately changes the
corresponding policy control.

The controls retain two explicit choices:

- `automatic`: Tavernary may derive and maintain the field automatically.
- `manual`: use the submitted field as owner/editor-authored metadata.

Existing cards initialize from their current summary and tag policies. New
owner-added cards initialize as automatic. Review shows both the proposed
values and their explicit policies. The owner may submit changed text or tags
while leaving the field automatic; those values remain proposal context rather
than authoritative manual metadata.

This behavior does not reinterpret existing manifests. Issue #166 remains a
manual-summary request because its authoritative manifest already says manual.

## Provider Contract

The catalog-copy provider request continues using strict JSON Schema. The
system prompt and repair prompt must also enumerate the exact output keys and
allowed result values so providers that incompletely honor
`response_format.json_schema` still receive the contract in plain language.

Every provider result is validated locally. Invalid output receives one
bounded repair request with sanitized validation defects. Raw provider output,
repository text, submitted text, credentials, and policy-sensitive content
must not be written to Actions logs, issue comments, or durable failure
notices.

No normalization may guess at semantically different provider fields. For
example, an unknown `status` must not be silently treated as `result`.

## Safe Degradation for Verified Manual Owner Copy

When a verified repository owner or Tavernary staff member submits a changed
manual summary:

1. Run the normal preservation request.
2. If validation fails, run the existing bounded repair.
3. If either provider transport or repaired output still fails, retain the
   submitted summary exactly and record a sanitized `copy-review-unavailable`
   diagnostic.
4. Generate the exact-path owner review pull request.
5. Set the generated publication transaction to `manual`.
6. Explain in the pull request that contextual copy review was unavailable and
   a maintainer must inspect the owner wording before merge.

The fallback is allowed only for verified owner/staff manual summary copy. It
does not apply to community submissions, automatic summaries, automatic tags,
or unverified authority.

The generation report and pull-request marker must distinguish a validated copy
result from this fallback. They must not fabricate `accepted-unchanged`,
`change_reasons`, or `policy_signal` values. Existing transaction validation
must continue rejecting a fallback marked for automatic publication.

Manual owner tags remain governed by controlled vocabulary and authority
validation and do not require model-generated replacement values.

## Automatic Metadata Failure

Automatic metadata requires a valid provider result. If the initial request and
bounded repair cannot produce one, generation remains fail-closed:

- create no new pull request;
- push no partial generated branch state;
- publish no project mutation; and
- expose only a sanitized retryable diagnostic.

This applies to ordinary project submissions and owner requests whose required
automatic fields cannot be generated. The system does not substitute the
submitter description, repository description, an empty value, or stale
generated copy.

## Workflow Failure Reconciliation

Both project-generation workflows gain an always-run terminal failure step:

- `.github/workflows/generate-project-owner-request.yml`
- `.github/workflows/generate-project-submission.yml`

For a non-cancelled failed run, the step re-reads current issue and pull-request
state before mutation.

If the issue is still open and admitted:

- when an owned generated pull request exists, set `submission-pr-open`;
- otherwise set `submission-retryable`;
- remove stale owned queue labels, including `needs-maintainer-review`;
- preserve unrelated labels; and
- create or update one marker-based failure comment.

The public comment states that generation stopped before publication, provides
the Actions run URL, and explains that the request can be retried. It uses a
stable hidden marker so repeated failures update one comment rather than
spamming the issue. It contains only a stable sanitized reason category, never
raw provider output or untrusted source text.

Failure reconciliation must not overwrite `needs-information`,
`submission-declined`, a closed issue, or a newer successful
`submission-pr-open` state. It must tolerate failure before the generation
report exists.

Cancelled or superseded concurrency runs do not label the issue as failed.

## Successful Lifecycle

Successful automatic transactions retain the existing sequence:

```text
admission -> generation -> review PR -> CI -> exact-SHA publication -> deploy
```

Successful owner edit-card requests remain automatically publishable when all
required copy review and validation succeeds.

A degraded manual-owner-copy transaction follows:

```text
admission -> generation -> review PR -> CI -> maintainer review and merge
```

The workflow never automatically converts that manual fallback into an
automatic transaction on retry. A later successful regeneration may replace
the fallback with a validated automatic transaction only when exact branch,
marker, and maintainer-divergence guards permit it.

## Issue #166 Recovery

After the repair reaches `main` and deploys:

1. Dispatch owner-request generation for issue #166 with guarded regeneration.
2. Confirm authority and issue state remain valid.
3. Confirm exactly one owned branch and pull request are created or updated.
4. Confirm the generated project record matches the authoritative manifest.
5. Confirm focused CI and full required validation pass.
6. If copy preservation validates, allow the existing automatic publication
   path to merge it.
7. If copy review remains unavailable, inspect and merge the manual fallback
   pull request as a maintainer.
8. Verify the issue lifecycle, merged catalog state, deployment workflow, and
   live catalog card.

The issue manifest is not silently rewritten from manual to automatic.

## Testing

Implementation follows one-test-at-a-time red-green-refactor.

### Owner builder

- Editing summary text leaves automatic policy automatic.
- Editing tags leaves automatic policy automatic.
- Explicit manual choices survive review, back/edit, and GitHub handoff.
- Existing manual cards remain manual until explicitly changed.

### Copy generation

- The provider prompt includes the exact output contract.
- One invalid response triggers one repair.
- A second invalid response for verified manual owner copy returns an explicit
  degraded result without a fabricated copy-review success.
- Provider transport failure uses the same manual-review fallback.
- The fallback preserves submitted owner copy exactly.
- The fallback changes publication mode to manual.
- Community and automatic metadata failures still throw without writing
  project mutations.

### Workflow lifecycle

- Both generation workflows include terminal failure reconciliation.
- A failed run without a pull request produces `submission-retryable`.
- A failed run with an owned pull request preserves `submission-pr-open`.
- Owned stale labels are replaced atomically while unrelated labels remain.
- Repeated failures update one marker comment.
- Closed, declined, needs-information, cancelled, and newer-success states are
  not overwritten.
- Failure handling works when no generation report or branch exists.

### Publication

- Validated automatic edit-card transactions remain mergeable.
- Degraded owner-copy transactions require manual approval.
- No degraded transaction can claim a valid copy result or automatic
  publication.
- Exact path, source identity, fingerprints, branch ownership, and exact-head
  checks remain green.

## Verification

Run focused owner-builder, copy-provider, owner-generation,
project-generation, workflow, publication-transaction, and
publication-planner tests. Then run the repository's full check and test gates.

After pushing the repair, monitor every workflow for the repair SHA. Rerun issue
#166 and continue through pull-request checks, publication, deployment, and
live HTTP/catalog verification. Report local test evidence, remote workflow
evidence, and live result separately.

## Acceptance Criteria

- Editing proposed owner metadata does not silently opt into manual policy.
- Invalid provider output cannot leave an admitted issue falsely awaiting
  review.
- Verified manual owner copy can produce a human-review pull request when
  contextual copy review is unavailable.
- Unreviewed fallback copy cannot auto-merge.
- Automatic metadata never falls back to invented, empty, or unreviewed copy.
- Repeated failures produce one actionable, sanitized issue notice.
- Successful owner edit-card automation still reaches automatic publication.
- Issue #166 is processed through the repaired workflow and verified live.
