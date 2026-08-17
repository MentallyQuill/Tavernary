# GitHub Contributor Security Policy Design

**Date:** 2026-08-16
**Repositories:** `MentallyQuill/Tavernary`, `MentallyQuill/TavernKeeper`

## Goal

Give trusted contributors a safe lane to create and push feature branches while
requiring every change to `main` to pass repository checks and receive approval
from `MentallyQuill`. Preserve Codex administration through the GitHub CLI
identity `MentallyQuill` without permitting direct pushes, force-pushes, or
deletion of `main`.

## Authority Model

- `MentallyQuill` remains repository Admin for settings, access management,
  reviews, merges, and incident recovery.
- Trusted contributors receive Write access. They may create and update feature
  branches and open pull requests, but may not update `main` directly.
- `MentallyQuill` receives a ruleset bypass with mode `pull_request`. This
  permits owner-authored pull requests to merge without an unavailable second
  reviewer while retaining a pull request and audit trail.
- Codex uses the authenticated GitHub CLI identity `MentallyQuill` and retains
  the complete branch, pull request, review, merge, and repository-settings
  workflow through that identity.
- No contributor, workflow, or app receives a new broad bypass.
- TavernKeeper's existing Publisher integration bypass remains unchanged so
  its validated report-publication path continues to function.

## Repository-Owned Review

Add `.github/CODEOWNERS` to each repository with:

```text
* @MentallyQuill
```

The default-branch ruleset will require code-owner review. This makes approval
by `MentallyQuill` mandatory for contributor pull requests even if more Write
collaborators are added later. The wildcard also protects changes to
`.github/CODEOWNERS` and workflow files.

## Default-Branch Rulesets

Both active rulesets target only `~DEFAULT_BRANCH`. Feature branches remain
unprotected and writable by trusted contributors.

Both rulesets enforce:

- deletion protection;
- non-fast-forward and force-push protection;
- a pull request before merge;
- one approving review;
- code-owner review;
- dismissal of stale approvals after reviewable commits are pushed;
- approval of the most recent reviewable push by someone other than its author;
- resolution of all review conversations;
- strict required status checks against the latest `main`;
- `MentallyQuill` user ID `2625904` as a `pull_request`-only bypass actor.

Tavernary requires these GitHub Actions checks:

- `verify`
- `visual`

The `visual` job is present and successful for full changes and present with a
successful skipped conclusion for content-only changes. Preserve Tavernary's
currently enabled merge methods: merge, squash, and rebase.

TavernKeeper requires these GitHub Actions checks:

- `check`
- `scanner-toolchain`

Preserve TavernKeeper's merge-only ruleset and the existing Integration actor
ID `4457566` with `always` bypass mode for the TavernKeeper Publisher.

## GitHub Actions Policy

Apply these repository-level settings to both repositories:

- keep Actions enabled;
- allow GitHub-owned actions only;
- keep default `GITHUB_TOKEN` workflow permissions at Read;
- prevent workflows from creating or approving pull request reviews;
- require workflow approval for all external fork contributors;
- automatically delete head branches after pull requests merge.

The live workflow audit found no `pull_request_target` triggers. Pull-request
validation uses read-only repository contents. Every external action reference
is under `actions/*` and pinned to a full commit SHA, so restricting Actions to
GitHub-owned actions preserves the current workflows. Tavernary does not use
its currently enabled workflow review-approval permission.

Fork workflow approval applies to external fork contributors. A trusted Write
collaborator working on a same-repository feature branch may run the read-only
pull-request checks normally.

## Existing Security Controls

Retain and verify the controls already enabled on both repositories:

- public visibility and fork support;
- secret scanning;
- secret-scanning push protection;
- repository default workflow permissions set to Read;
- actions pinned to immutable commit SHAs.

Dependabot security updates, additional secret-pattern scanning, signed-commit
requirements, release/tag rules, and restrictions on feature-branch creation
are outside this change. They are not required to establish the approved
contributor lane and could add unrelated maintenance or compatibility costs.

## Rollout

1. Create the CODEOWNERS change on a feature branch in each repository and
   merge it before requiring code-owner review.
2. Update each existing default-branch ruleset in one request, preserving its
   existing target and integration bypasses while adding the approved review,
   check, and owner-bypass settings.
3. Harden repository Actions permissions and enable automatic merged-branch
   cleanup.
4. Re-read every setting through the GitHub API.
5. Confirm the required check contexts exist on recent pull-request heads and
   confirm both default branches report protected.

## Verification

The completed policy must prove all of the following from live GitHub state:

- both rulesets are active and target only the default branch;
- contributor updates to `main` require a pull request, current owner approval,
  resolved conversations, and all repository-specific checks;
- `MentallyQuill` has only pull-request-mode bypass authority;
- the TavernKeeper Publisher retains its existing integration bypass;
- feature branches are not covered by a creation restriction;
- Actions are limited to GitHub-owned actions with Read default permissions;
- workflow PR review approval is disabled;
- every external fork contributor requires workflow approval;
- secret scanning and push protection remain enabled;
- the current workflow action references remain compatible with the restricted
  Actions policy.

If a required check is absent from new pull requests or a Publisher operation
is blocked, restore the immediately preceding ruleset payload, then diagnose
the exact check or app identity before attempting another update.

## Non-Goals

- Contributors are not forced to work from forks.
- Feature branches are not globally protected or name-restricted.
- `MentallyQuill` does not receive an `always` bypass.
- Codex does not receive a separate account, token, or app exemption.
- This policy does not alter application code, publication semantics, workflow
  triggers, secrets, or repository visibility.
