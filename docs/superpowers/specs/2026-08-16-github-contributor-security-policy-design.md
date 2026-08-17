# GitHub Contributor Security Policy Design

**Date:** 2026-08-16
**Repositories:** `MentallyQuill/Tavernary`, `MentallyQuill/TavernKeeper`

## Goal

Give trusted Write contributors a same-repository feature-branch lane while
requiring every change to `main` to pass repository checks and receive approval
from `MentallyQuill`. Preserve Codex administration through the GitHub CLI
identity `MentallyQuill`, and preserve narrowly scoped publication automation
without granting ordinary GitHub Actions a protected-branch bypass.

## Authority Model

- `MentallyQuill` remains repository Admin for settings, access management,
  reviews, merges, and incident recovery.
- Trusted contributors receive Write access. They may create and update feature
  branches and open pull requests, but may not update `main` directly.
- `MentallyQuill` receives a ruleset bypass with mode `pull_request`. Owner work
  still uses a pull request and audit trail, but does not require an unavailable
  second reviewer.
- Codex uses the authenticated GitHub CLI identity `MentallyQuill` and retains
  branch, pull request, review, merge, and repository-settings access through
  that identity.
- The shared GitHub Actions integration does not receive a bypass. A contributor
  must not be able to turn a branch workflow into a protected-branch writer.
- TavernKeeper's existing Publisher integration bypass remains unchanged.
- Tavernary receives a separate private Publisher GitHub App installed only on
  `MentallyQuill/Tavernary`. Only that App receives an `always` bypass.

## Tavernary Publisher App

The Publisher is an unlisted, account-owned GitHub App with no server, callback,
or webhook. It is installed only on Tavernary and has these repository
permissions:

- Contents: Read and write;
- Actions: Read and write, used only to dispatch protected publisher workflows;
- Metadata: Read-only, as required by GitHub;
- no Issues, Pull requests, Administration, Workflows, or organization
  permissions.

The App's private key is stored only as the protected `publisher` environment
secret `TAVERNARY_PUBLISHER_APP_PRIVATE_KEY`; its App ID is the environment
variable `TAVERNARY_PUBLISHER_APP_ID`. The environment permits deployments only
from the `main` branch.

Each job that can push `HEAD:main` must:

- reference the `publisher` environment;
- keep ordinary `GITHUB_TOKEN` contents permission at Read;
- generate a short-lived installation token with the full-SHA-pinned
  `actions/create-github-app-token` action;
- use that token for checkout and Git publication;
- retain ordinary `GITHUB_TOKEN` permissions only for non-content operations
  such as Issues or Actions dispatches;
- reject a manual dispatch unless the actor is `MentallyQuill`, the unique
  Tavernary Publisher App, or, for report import only, the existing scoped
  TavernKeeper wake App.

Trusted main-branch workflows that dispatch a protected publisher also reference
the `publisher` environment and mint an Actions-only App token for that dispatch.
The target therefore sees the unique Publisher App actor, never the shared
`github-actions[bot]` identity that contributor branch workflows can also use.
The environment branch policy prevents a feature-branch workflow from obtaining
the App credential.

This boundary covers direct writers and the durable enrichment orchestrator:

- `apply-kit-submission.yml`;
- `apply-kit-withdrawal.yml`;
- `backfill-repository-identities.yml`;
- `enrich-catalog.yml`;
- `import-tavernkeeper-reports.yml`;
- `publish-openai-usage.yml`;
- `refresh-catalog.yml`;
- `review-catalog-policy.yml`.

Repository tests enumerate this set so a future ordinary-token `main` writer
fails CI. They also enumerate every internal dispatch to these workflows,
require exact App-action pins, scan both YAML extensions and multiple direct
`main` write forms, and reject job-level contents-write overrides.

`review-catalog-policy.yml` validates its requested SHA before minting an App
token or checking out code. A transaction PR must supply its exact GitHub merge
commit, and every supplied SHA must be identical to or an ancestor of current
`main`. This prevents caller-controlled branch code from running with Publisher
credentials.

## Repository-Owned Review

Add `.github/CODEOWNERS` to each repository with:

```text
* @MentallyQuill
```

The default-branch ruleset requires code-owner review. The wildcard protects
all paths, including CODEOWNERS and workflow files.

## Default-Branch Rulesets

Both active rulesets target only `~DEFAULT_BRANCH`. Feature branches remain
unprotected and writable by trusted contributors.

Both rulesets enforce:

- deletion and non-fast-forward protection;
- a pull request before merge;
- one approving code-owner review;
- stale-review dismissal after reviewable commits;
- approval of the most recent reviewable push by someone other than its author;
- resolution of all review conversations;
- strict required status checks against the latest `main`;
- `MentallyQuill` user ID `2625904` as a `pull_request`-only bypass actor.

Tavernary requires `verify` and `visual`, keeps merge, squash, and rebase, and
adds the Tavernary Publisher integration as its sole `always` bypass. A skipped
`visual` job remains an accepted successful conclusion for content-only work.

TavernKeeper requires `check` and `scanner-toolchain`, remains merge-only, and
preserves Publisher Integration ID `4457566` with `always` bypass.

All required checks are bound to GitHub Actions Integration ID `15368`.

## Repository Actions Policy

Apply these repository-level settings to both repositories:

- keep Actions enabled and allow GitHub-owned actions only;
- keep default `GITHUB_TOKEN` workflow permissions at Read;
- prevent workflows from creating or approving pull request reviews;
- require workflow approval for all external fork contributors;
- automatically delete head branches after pull requests merge.

The workflow audit found no `pull_request_target` triggers. Pull-request
validation uses read-only contents, and all external action references are
SHA-pinned `actions/*` dependencies. A trusted Write collaborator's same-repo
pull-request checks therefore run normally, while untrusted fork workflows
require approval.

## Existing Security Controls

Retain and verify public visibility, fork support, secret scanning,
secret-scanning push protection, Read default workflow permissions, and
immutable action pins. Dependabot security updates, signed-commit requirements,
release/tag rules, and feature-branch naming restrictions are outside this
change.

## Rollout and Verification

1. Add a failing workflow-policy test, migrate all eight Tavernary publishers,
   and prove the focused and full repository gates pass.
2. Register and install the private App, create its protected environment, and
   store the App ID and private key without exposing the key.
3. Merge Tavernary's workflow and CODEOWNERS change, then merge TavernKeeper's
   CODEOWNERS change.
4. Update both default-branch rulesets in place, preserving existing integration
   bypasses and adding only the approved owner and Publisher actors.
5. Harden Actions and branch-cleanup settings, then re-read every setting from
   GitHub.
6. Confirm only `main` is protected, required check provenance is exact, the App
   is installed only on Tavernary, and no feature-branch creation restriction
   exists.
7. Dispatch a bounded Publisher operation that is safe when no content changes
   are pending, and verify the privileged job obtains its environment and runs
   without a ruleset or credential failure.

If a required check is absent or publication is blocked, restore the captured
pre-change ruleset payload and diagnose the exact check or App identity before
another update.

## Non-Goals

- Contributors are not forced to work from forks.
- Feature branches are not globally protected or name-restricted.
- `MentallyQuill` does not receive an `always` bypass.
- Codex does not receive a separate identity or credential.
- The Publisher App does not merge pull requests, edit workflows, administer
  repositories, or access TavernKeeper.
