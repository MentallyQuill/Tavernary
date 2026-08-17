# Tavernary Publisher Full Verification Design

**Status:** Approved on 2026-08-17

## Goal

Provide repeatable proof that the Tavernary Publisher can authenticate with the
GitHub-recommended Client ID, obtain only its reviewed repository permissions,
and make a normal direct push through the protected `main` ruleset while an
ordinary owner token remains unable to push directly.

## Verification workflow

Add `publisher-verification.yml` as an owner-only, input-free
`workflow_dispatch` workflow. Its single job runs only from `main`, uses the
main-only `publisher` environment, keeps `GITHUB_TOKEN` at `contents: read`, and
mints a short-lived installation token from
`vars.TAVERNARY_PUBLISHER_CLIENT_ID` and
`secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY`.

The job checks out the trusted default branch with the App token, creates one
empty audit commit, rebases that empty commit onto the latest `main` with
`--keep-empty`, and pushes `HEAD:main` without force. The action's post step
revokes the installation token. The empty commit deliberately changes no
repository content while proving the App's protected-branch bypass.

## Policy boundary

The workflow is added to the existing Publisher writer allowlist and action-pin
tests. Tests require the exact protected environment, Client ID variable,
private-key secret, owner actor guard, input-free trigger, pinned actions,
non-force push, and App-token checkout. Any additional direct `main` writer or
credential placement continues to fail CI.

## Live proof

After the PR is merged, dispatch the workflow from `main` and verify token
creation, the protected-main commit, token revocation, and downstream push
workflows. Then create a disposable empty owner-authored commit from current
`main` and attempt the same direct push. The ruleset must reject it. The feature
branch and its PR provide the positive same-repository branch and PR lane proof.

No collaborator is invited by this verification; onboarding remains an
identity-specific access-management step.
