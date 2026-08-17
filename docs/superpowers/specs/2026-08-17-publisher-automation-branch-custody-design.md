# Publisher Automation Branch Custody Design

**Status:** Approved on 2026-08-17
**Repositories:** `MentallyQuill/Tavernary`, `MentallyQuill/TavernKeeper`

## Goal

Prevent trusted Write collaborators from creating, replacing, updating, force
pushing, or deleting Tavernary's generated project-review branches while
preserving their ability to create ordinary same-repository feature branches and
submit pull requests to protected `main`.

## Repository scope

Tavernary owns two generated branch namespaces:

- `automation/project-submission-*`;
- `automation/project-owner-request-*`.

TavernKeeper has no equivalent generated-branch publication path. Its Publisher
continues to write validated operational changes directly to protected `main`,
so TavernKeeper receives no new branch ruleset or workflow change.

## Authority model

The Tavernary Publisher App becomes the sole writer and deleter for both
generated namespaces. Ordinary `GITHUB_TOKEN` remains responsible for Issues,
Pull requests, and Actions APIs, but never authenticates Git branch creation,
update, force-with-lease regeneration, or deletion in those namespaces.

Generation runs remain `workflow_dispatch` jobs pinned to `main`. Each generation
job uses the existing main-only `publisher` environment, creates a short-lived
Contents-write Publisher installation token, and gives that token only to
`actions/checkout` for persisted Git credentials. Root `GITHUB_TOKEN` Contents
permission is reduced from Write to Read.

Generation jobs accept dispatches only from `MentallyQuill` or the unique
Tavernary Publisher bot. The trusted automatic chain uses Actions-only Publisher
tokens for `admit-issue.yml` -> project triage -> project generation. Manual
admission reruns are owner-only. The shared `github-actions[bot]` identity is
never accepted by a Publisher-credentialed triage or generation job.

The Publisher private key remains available only through the environment whose
sole deployment branch policy is `main`. It is not copied into repository
secrets and the environment is not widened to `refs/pull/*/merge`.

## Lifecycle cleanup

Closed-PR lifecycle workflows must not access Publisher credentials from a
pull-request merge ref. They continue to process issue state with ordinary
`GITHUB_TOKEN` and never mutate generated refs.

A dedicated `pull_request_target` cleanup workflow runs trusted default-branch
code for closed pull requests targeting `main`. It never checks out or executes
the pull-request head. Because `pull_request_target` uses the base ref, the
main-only Publisher environment remains available without widening its branch
policy. Manual cleanup dispatch is restricted to `MentallyQuill` on `main`.

The cleanup workflow re-reads the repository default branch, closed pull
request, and current branch ref. It
deletes only when all of these values match:

- the branch exactly matches `automation/project-submission-<positive integer>`
  or `automation/project-owner-request-<positive integer>`;
- the pull request is closed, belongs to Tavernary, and targets the default
  branch;
- the pull request head repository, branch, and SHA match the requested cleanup;
- the current branch ref still equals that exact SHA.

A missing or moved branch is a successful no-op. Only the final delete call uses
the Publisher token. Deletion uses Git's exact-SHA `--force-with-lease` form, so
the remote rejects the delete atomically if the ref moves after validation. Only
an HTTP 404 ref read is treated as absent; authentication, rate-limit, and server
errors fail the cleanup before token minting.

## Branch ruleset

Create one active Tavernary branch ruleset targeting only:

- `refs/heads/automation/project-submission-*`;
- `refs/heads/automation/project-owner-request-*`.

The ruleset restricts creation, updates, and deletion and blocks
non-fast-forward updates. Tavernary Publisher Integration ID `4624827` is the
only bypass actor, with mode `always`. Neither `MentallyQuill`, repository
administrators, repository roles, nor the shared GitHub Actions integration
receive bypass.

The existing `main` ruleset remains unchanged. No rule targets ordinary branches
such as `feat/*`, `fix/*`, `codex/*`, or contributor-named branches.

## Verification

Add an owner-only manual canary that runs from `main`, uses the protected
Publisher environment, and exercises App-authenticated create, fast-forward
update, and deletion on the reserved branch
`automation/project-submission-0`. The canary creates an empty commit with the
current `main` tree so it changes no repository content. CI must never dispatch
automatic publication for this reserved branch.

After the workflow changes merge and the ruleset is active:

1. the Publisher canary must create, update, and remove the reserved branch;
2. an ordinary `MentallyQuill` Git push attempting to create that same branch
   must fail with repository-rule enforcement;
3. live rule inspection must show only the two generated namespaces and only
   Publisher Integration ID `4624827` as bypass;
4. ordinary feature-branch creation and the protected `main` ruleset must remain
   unchanged;
5. TavernKeeper must still have no automation-namespace ruleset.

## Failure and rollback

Workflow authentication lands and passes before the ruleset is created. If the
App canary fails after activation, disable only the new automation-branch
ruleset, diagnose the exact App token or ref operation, and leave the existing
`main` ruleset intact. Never broaden the bypass to GitHub Actions as a shortcut.
