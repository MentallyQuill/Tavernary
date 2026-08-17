# GitHub Contributor Security Policy Implementation Plan

> **Execution skill:** Use `superpowers:executing-plans`; verify each security
> boundary before progressing to the next live mutation.

**Goal:** Protect `main` in Tavernary and TavernKeeper while preserving writable
same-repository contributor branches, mandatory owner review, repository checks,
publication automation, and Codex access through `MentallyQuill`.

**Architecture:** Ordinary GitHub Actions remains unable to bypass `main`.
Tavernary's eight content publishers use a repository-only GitHub App through a
main-only protected environment. CODEOWNERS lands before code-owner enforcement;
then each existing default-branch ruleset is replaced atomically and verified
from fresh API responses.

## Constraints

- Target rules only at `~DEFAULT_BRANCH`.
- Give `MentallyQuill` user ID `2625904` only `pull_request` bypass.
- Preserve TavernKeeper Publisher Integration ID `4457566` with `always` bypass.
- Give Tavernary's new Publisher integration the only Tavernary `always` bypass.
- Bind checks to GitHub Actions Integration ID `15368`.
- Use `verify` and `visual` for Tavernary; `check` and `scanner-toolchain` for
  TavernKeeper.
- Keep default workflow permissions Read; never give GitHub Actions a ruleset
  bypass.
- Use GitHub CLI with network permission enabled for every remote operation.
- Never print, commit, or retain the Publisher private key after secret upload.

## Task 1: Enforce the Publisher Boundary in Source

- [ ] Add a failing test enumerating all direct and indirect `main` publishers.
- [ ] Require each publisher job to use environment `publisher`.
- [ ] Change workflow-level contents permission from Write to Read.
- [ ] Add a full-SHA-pinned `actions/create-github-app-token` step with
  `TAVERNARY_PUBLISHER_APP_ID` and `TAVERNARY_PUBLISHER_APP_PRIVATE_KEY`.
- [ ] Use the App token for checkout and publication while retaining ordinary
  tokens only for Issues and Actions APIs.
- [ ] Gate manual privileged dispatches to user ID `2625904` or the trusted
  repository automation actor ID `41898282`.
- [ ] Add `.github/CODEOWNERS` with `* @MentallyQuill`.
- [ ] Run focused workflow tests, content checks, full checks, and `git diff
  --check`; commit only after all pass.

## Task 2: Provision the Tavernary Publisher

- [ ] Register the private account-owned `Tavernary Publisher` App with Contents
  Read/Write, Metadata Read, no webhooks, and no other permissions.
- [ ] Install it only on `MentallyQuill/Tavernary` and capture its Integration ID.
- [ ] Create environment `publisher` with a custom deployment branch policy for
  exactly `main`.
- [ ] Store App ID as `TAVERNARY_PUBLISHER_APP_ID` and private key as
  `TAVERNARY_PUBLISHER_APP_PRIVATE_KEY` in that environment.
- [ ] Verify the installation, environment policy, variable, and secret metadata;
  securely remove the local private-key file.

## Task 3: Merge Repository-Owned Policy

- [ ] Push `codex/github-contributor-security-policy`, open the Tavernary PR, and
  wait for `verify` and `visual`.
- [ ] Merge Tavernary and verify the exact workflow and CODEOWNERS commit on
  `main`.
- [ ] Create TavernKeeper's matching CODEOWNERS branch from fresh `main` through
  the GitHub API, open the PR, wait for `check` and `scanner-toolchain`, and merge.

## Task 4: Apply Live Repository Rules

- [ ] Capture complete pre-change ruleset payloads for rollback.
- [ ] Update Tavernary ruleset `19711101` with one approval, code-owner review,
  stale dismissal, last-push approval, conversation resolution, strict `verify`
  and `visual`, owner PR-only bypass, and Publisher always bypass.
- [ ] Update TavernKeeper ruleset `20197146` equivalently with strict `check` and
  `scanner-toolchain`, preserving Publisher ID `4457566`.
- [ ] Restrict both repositories to GitHub-owned Actions, Read default tokens, no
  workflow PR approvals, all-external fork approval, and merged-branch deletion.

## Task 5: Prove the Complete Policy

- [ ] Re-read rulesets, protected branches, Actions permissions, collaborator
  access, CODEOWNERS, security analysis, environment policy, App installation,
  and check provenance.
- [ ] Confirm only `main` is protected and feature branches remain creatable.
- [ ] Run a bounded no-change Publisher workflow and verify App authentication,
  protected-environment access, and ruleset compatibility.
- [ ] Record final PR URLs, merge commits, workflow run, ruleset IDs, and clean
  local branch state.
