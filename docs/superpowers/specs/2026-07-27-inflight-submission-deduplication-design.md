# In-Flight Submission Deduplication Design

## Goal

Prevent multiple open Tavernary review pull requests for the same submitted
project source while preserving the earliest admitted submission as the
maintainer review surface.

## Problem

Project triage currently compares a resolved submission identity only with
projects already published in the catalog. It does not compare the source with
other open admitted submissions. Two people can therefore submit the same
repository before either review PR merges, producing separate automation
branches and PRs that write the same catalog record and snapshot paths.

Pathweaver demonstrated this gap: issues #72 and #74 resolved to GitHub
repository ID `1133781448`, but both were admitted and generated PRs because the
repository was not published yet.

## Identity Authority

Deduplication uses the existing `sourceDuplicateKeys()` contract rather than
display names, submitted titles, or generated slugs.

For GitHub sources, comparison uses:

1. GitHub repository ID when resolution succeeds.
2. Normalized `owner/repository`.
3. Normalized canonical GitHub URL.

Repository ID preserves identity across renames and transfers. Different forks
remain distinct because they have different repository IDs. URL casing,
trailing slashes, and `.git` suffixes do not create distinct identities.

Reddit and external sources retain their existing canonical post-ID and URL
identity rules.

## Winner Selection

The earliest eligible issue wins:

- The candidate is an open issue, not a pull request.
- It has both `project-submission` and `issue-admitted`.
- It has neither `duplicate-candidate` nor `submission-declined`.
- Its issue number is lower than the current issue number.
- Its resolved source identity intersects the current submission's duplicate
  keys.

The lowest matching issue number is the surviving submission. This rule is
deterministic across different submitters and independent workflow timing.

An earlier admitted submission remains authoritative even when it currently
needs information or a retry. Maintainers can close that submission before
retrying a later one if they intentionally want the later issue to replace it.

## Triage Architecture

After parsing and resolving the current submission source, Project triage:

1. Lists open issues labeled `project-submission` and `issue-admitted`, with
   pagination.
2. Excludes the current issue, higher-numbered issues, pull requests, and
   terminal submission states.
3. Parses each remaining candidate's Project manifest.
4. Resolves candidate identity through the same source-identity utilities used
   for the current submission:
   - GitHub candidates use the repository API to obtain permanent repository
     identity.
   - Reddit share links use the existing bounded redirect resolution.
   - Stable Reddit and external URLs use their canonical parsed identity.
5. Compares `sourceDuplicateKeys()` and selects the lowest matching issue.
6. Looks up the deterministic generated branch
   `automation/project-submission-<issue-number>` for an open PR link. The issue
   link is sufficient when generation has not started.

Candidate resolution is bounded and fail-safe. A malformed or temporarily
unresolvable candidate is skipped rather than used to close another person's
submission. Exact structural identities that parse successfully remain
comparable even when optional GitHub repository-ID enrichment is unavailable.

## In-Flight Duplicate Decision

An in-flight match is distinct from an already-published catalog duplicate.
The decision contains:

- surviving issue number and URL;
- surviving PR number and URL when available;
- resolved source identity;
- reason `inflight-submission`.

The existing triage synchronization path then:

- applies `duplicate-candidate`;
- removes active queue labels such as `needs-maintainer-review`,
  `submission-retryable`, and `submission-pr-open`;
- writes or updates a stable comment explaining that review continues in the
  earlier issue and PR;
- closes the later issue as `not_planned`;
- sets generation output to false.

The later issue remains available as preserved contributor context. The
surviving issue is not modified.

## Generation Collision Guard

Triage is the user-facing prevention layer. Generation adds an independent
fail-closed invariant before committing or pushing generated paths.

After regeneration determines the intended path set, but before `git commit` or
`git push`, the generator:

1. Lists open PRs in the Tavernary repository with pagination.
2. Accepts only valid Tavernary submission markers whose head repository is
   Tavernary and whose head branch matches
   `automation/project-submission-<marker issue number>`.
3. Ignores the PR belonging to the current issue.
4. Compares only source-owned `data/registry/projects/*.json` and
   `data/snapshots/github/*.json` marker paths with the current intended paths.
   Shared paths such as `data/vocabularies/frontends.json` are not identity
   claims and do not constitute a collision.
5. Stops with an explicit error linking the conflicting issue and PR when a
   source-owned path overlaps.

This guard performs no issue mutation. It exists for timing races, older
workflow versions, and unexpected identity-resolution gaps. A guard failure
leaves the current issue open for maintainer inspection but guarantees that a
second generated PR is not created.

## Error Handling

- Published catalog duplicates retain their existing automatic close behavior.
- In-flight duplicates close automatically only after a positive canonical
  identity match.
- Candidate listing or pagination failure produces the existing retryable
  triage state with code `submission-inventory-unavailable`; generation is not
  dispatched.
- Failure to resolve one candidate skips that candidate and adds a
  `candidate-scan-incomplete` warning to the stable triage comment; it does not
  create a false duplicate.
- Open-PR listing failure stops generation before mutation.
- Marker spoofing from forks or unexpected branches is ignored.
- Existing per-issue regeneration protection and maintainer-edit safeguards
  remain unchanged.

## Verification

Focused tests cover:

- identical GitHub URLs with casing, slash, and `.git` variations;
- renamed or transferred GitHub repositories matched by repository ID;
- different forks with similar names remaining distinct;
- Reddit and external canonical identity reuse;
- exclusion of higher-numbered, closed, terminal, malformed, and PR items;
- deterministic lowest-issue selection;
- duplicate comment and label lifecycle with and without an existing PR;
- no generation dispatch for an in-flight duplicate;
- overlapping source-owned generated paths stopping before commit or push;
- shared vocabulary paths not producing false collisions;
- current-issue PR markers being ignored on regeneration;
- fork and malformed marker spoofing being ignored;
- paginated issue and PR inventories.

The focused admission, triage, generator, PR-marker, and workflow suites run
first. Complete formatting, lint, typecheck, and unit verification follow.

## Scope

Expected implementation areas:

- source-identity-aware open-submission discovery;
- Project admission decision and declaration types;
- Project triage orchestration, comments, and tests;
- generated-PR collision inspection;
- generator workflow placement and workflow contract tests.

Kit submission deduplication, catalog publication rules, issue-form fields,
submission-builder behavior, and merging contributor prose between duplicate
issues are out of scope. The previously approved label-driven routing work
remains a separate implementation plan.
