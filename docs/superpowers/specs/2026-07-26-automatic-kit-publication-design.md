# Automatic Kit Publication

## Problem

Kit create and edit submissions currently stop after automated validation and
wait for a maintainer to dispatch the publication workflow. Tavernary should
publish a valid Kit automatically, while preventing severe language in the
public title and description both before GitHub opens and after the submitter
has had an opportunity to edit the GitHub issue.

This change must preserve Tavernary's static GitHub-native architecture. The
GitHub issue remains the authenticated submission transport, the checked-in Kit
registry remains canonical, and GitHub Pages remains the publication target.

## Success Contract

A Kit create or edit submission is automatic when:

1. Tavernary's existing issue-admission workflow admits the GitHub issue.
2. Kit triage validates the latest issue manifest.
3. The title and description pass the shared severe-language policy.
4. Every existing structural, identity, ownership, moderation, and duplicate
   check passes.
5. Successful triage dispatches Kit publication without maintainer action.
6. Publication re-fetches and revalidates the latest issue.
7. Publication applies the canonical Kit record, runs the existing repository
   gates, rebases and pushes `main`, and dispatches Pages for the exact pushed
   commit.
8. Successful publication marks the issue published and closes it to release
   the submitter's open-issue slot.

A validation or publication failure leaves the issue open and does not claim
that the Kit was published.

## Chosen Architecture

Keep admission, Kit triage, and Kit publication as separate workflows.

- `admit-issue.yml` continues to enforce the repository-wide open-issue limit
  and dispatch Kit triage automatically.
- `triage-kit-submission.yml` validates and labels the issue, then dispatches
  `apply-kit-submission.yml` when the latest manifest is valid.
- `apply-kit-submission.yml` remains the serialized, write-enabled publication
  boundary. It re-fetches and revalidates the issue before changing the
  registry.
- The publisher retains the existing full validation, commit/rebase/push,
  exact-SHA Pages dispatch, and warning-only post-publication bookkeeping
  behavior.

This keeps write permissions out of the triage job and reuses the existing
retry-safe publisher. Combining validation and publication into one workflow
would blur permission and recovery boundaries. Generating and auto-merging a PR
would add latency and another concurrency surface without providing human
review.

## Severe-Language Policy

Tavernary will own a small, explicit English-language policy for severe
identity-based slurs and their well-known variants. The policy may use
[`zautumnz/profane-words`](https://github.com/zautumnz/profane-words/blob/master/words.json)
as review material, but it must not import that broad list or depend on its
package at runtime. That source explicitly warns about false positives and
contains ordinary profanity and general sexual vocabulary that Tavernary does
not intend to block.

The initial policy is limited to unmistakable severe slurs targeting race,
ethnicity, nationality, religion, sexual orientation, gender identity, or
disability. It excludes:

- common profanity, including `damn`, `ass`, and `shit`;
- general adult-content and anatomy terms;
- ordinary insults;
- words that are offensive only under a broad or ambiguous interpretation.

The checked-in policy data is the reviewable source of truth. Adding or removing
a blocked term is an intentional source change with focused tests; the policy
does not update from an external list automatically.

### Matching

The shared matcher:

1. applies Unicode compatibility normalization;
2. removes combining marks used to disguise letters;
3. lowercases text;
4. maps a small documented set of common numeric substitutions to letters;
5. recognizes punctuation or whitespace inserted between a blocked term's
   letters; and
6. matches complete normalized terms rather than arbitrary substrings.

The matcher does not use fuzzy edit-distance matching. Avoiding fuzzy and
substring matching limits false positives in legitimate Kit names and prose.

The matcher returns only whether a field violates the policy. User-facing
messages never echo or identify the matched term.

## Shared Validation Boundary

The policy and matcher live in a browser-safe Kit-domain module used by both:

- `validateKitDraft(...)`, which powers the Kit Builder; and
- `validateKitSubmission(...)`, which validates the GitHub issue manifest
  during triage and again during publication.

There must be one canonical policy and normalization implementation. The
browser and GitHub workflows must not maintain separate word lists or matching
rules.

The existing `description` model field is the Kit Builder's public summary for
the purpose of this requirement.

## Kit Builder Behavior

The existing Submit Kit control remains interactive so an attempted submission
can expose accessible validation feedback. A policy violation prevents
`onSubmit` from running, so Tavernary does not open or prefill the GitHub issue.

- A title violation displays `Title contains language Tavernary doesn't allow.`
- A description violation displays
  `Description contains language Tavernary doesn't allow.`
- Errors follow the existing touched/submission-attempt behavior.
- The first affected field receives focus after a blocked submit attempt.
- `aria-invalid` and `aria-describedby` use the existing field-error pattern.

The matched term is not repeated in the interface. Correcting the field clears
the violation through normal revalidation.

## GitHub Triage and Automatic Dispatch

`triage-kit-issue.mjs` exposes a machine-readable output that tells the workflow
whether the latest issue is valid for publication. It continues to synchronize
labels and the single marked validation comment.

When validation succeeds:

- existing objective warnings remain in the validation comment;
- near-duplicate composition remains a non-blocking warning;
- the issue no longer waits under `needs-maintainer-review`;
- triage dispatches `apply-kit-submission.yml` for that issue number.

When validation fails:

- the issue receives the existing appropriate failure label, normally
  `needs-information`;
- the marked validation comment explains the objective correction required;
- no publication workflow is dispatched.

Editing an open, admitted Kit issue reruns the same triage path. This permits a
submitter to correct a rejected GitHub manifest without a maintainer action.

## Publication and Issue Lifecycle

Publication re-fetches the issue and runs the same complete validator, including
the severe-language policy. A submitter therefore cannot bypass the Kit Builder
by changing title or description in GitHub.

The existing registry rules remain authoritative:

- create IDs remain derived from the title and immutable source issue;
- only the author's GitHub numeric identity may edit a Kit;
- withdrawn Kits cannot be edited or republished through a create retry;
- blocked identities cannot submit;
- exact duplicate project sets are rejected;
- all referenced projects must exist and be published;
- all composition, length, link, and markup rules remain in force.

Applying an edit whose canonical title, description, project order, and author
login are already unchanged is a no-op that preserves `updated_at`. This makes
duplicate dispatches and workflow reruns safe and prevents timestamp-only
commits.

After a successful push, publication must successfully dispatch
`deploy-pages.yml` with that exact pushed SHA. Only then does bookkeeping:

1. ensure and apply `kit-published`; and
2. close the source issue as completed.

The canonical commit and accepted deployment dispatch define publication
success. Label or issue-closure failures emit workflow warnings rather than
turning an already-published Kit into a false failure.

## Concurrency and Recovery

Kit triage keeps issue-scoped concurrency and may cancel an obsolete validation
run after a newer edit. Publication keeps the existing global Kit-registry
concurrency so registry writes remain serialized.

Every publisher run re-fetches the issue after synchronizing with current
`main`. Rapid triage events therefore converge on the latest issue content.
Idempotent create retries and unchanged edit retries prevent duplicate registry
changes.

Failure behavior:

| Failure | Result |
| --- | --- |
| Builder policy or ordinary validation failure | GitHub does not open |
| GitHub triage validation failure | Issue stays open; no publish dispatch |
| Revalidation, tests, commit, rebase, or push failure | Issue stays open; no deployment dispatch |
| Exact-SHA deployment dispatch failure | Publication workflow fails; issue stays open |
| Label or issue-closure bookkeeping failure after dispatch | Publication succeeds with a warning |
| Pages deployment later fails | Publication dispatch remains successful; the Pages run reports the deployment failure |

An open rejected issue can be corrected by editing it. A failed workflow can be
rerun through GitHub Actions without creating a new submission.

## Verification

### Shared policy unit tests

- Reject representative entries from every included severe-slur category.
- Reject capitalization variants.
- Reject punctuation and whitespace inserted between letters.
- Reject the documented basic numeric substitutions.
- Reject combining-mark and compatibility-character disguises.
- Allow `damn`, `ass`, `shit`, other intentionally permitted common profanity,
  and ordinary words containing similar letter sequences.
- Prove that matches are complete normalized terms, not fuzzy or arbitrary
  substring matches.

Tests should use the smallest representative fixture set needed to prove matcher
behavior. They should not duplicate the full policy data in snapshots.

### Kit Builder tests

- A title violation renders the title field error, focuses Title after submit,
  and does not call `onSubmit`.
- A description violation renders the description field error, focuses
  Description when Title is valid, and does not call `onSubmit`.
- Corrected text can proceed through the existing submission callback.
- Accessibility attributes follow the existing field-error contract.

### Server validator and apply tests

- The GitHub validator rejects the same title and description cases as the
  browser validator.
- Common profanity remains accepted when every other Kit rule passes.
- Invalid manifests do not produce the automatic-publication output.
- Valid creates and author-owned edits do produce that output.
- An unchanged edit retry preserves `updated_at` and creates no registry diff.

### Workflow tests

- Valid Kit triage dispatches `apply-kit-submission.yml` on `main`.
- Invalid Kit triage cannot dispatch publication.
- The publisher revalidates before writing.
- The publisher dispatches Pages with the exact pushed SHA.
- Issue closure occurs only after the required deployment dispatch.
- Post-publication label or closure failures remain visible warnings.

### Repository gates

Run the focused unit and workflow suites while implementing, then run
`npm run check` to cover formatting, lint, palette audit, catalog validation and
build, type checking, all unit tests, the production build, and static-export
verification. Run the focused Kit browser flow to prove the field feedback and
submission block in the rendered site.

## Scope

Included:

- automatic publication for valid Kit creates and edits;
- severe-language validation for Kit title and description;
- shared browser/server policy enforcement;
- idempotent unchanged edit retries;
- automatic successful-issue closure;
- documentation and tests for the changed workflow.

Unchanged:

- issue admission limits;
- Kit reports and withdrawals;
- Project submission and review automation;
- catalog enrichment, ranking, reactions, and Trending;
- the Kit record schema;
- static hosting and GitHub as the submission identity boundary.

No backend, account system, database, external moderation service, or runtime
profanity dependency is introduced.
