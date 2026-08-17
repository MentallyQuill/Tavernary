# Tavernary Publisher Full Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable, policy-enforced live test of Tavernary Publisher protected-main writes and prove ordinary owner direct writes remain blocked.

**Architecture:** A manual owner-only workflow uses the existing main-only `publisher` environment and repository-scoped App token to push one empty audit commit. Existing parsed-YAML policy tests enumerate the workflow as a protected Publisher writer and reject changes to its authority or token boundary.

**Tech Stack:** GitHub Actions YAML, `actions/create-github-app-token`, Vitest, YAML parser, GitHub rulesets, GitHub CLI.

## Global Constraints

- Use `vars.TAVERNARY_PUBLISHER_CLIENT_ID`; never restore the deprecated App ID input.
- Keep ordinary `GITHUB_TOKEN` permissions at `contents: read`.
- Run only from `main` through environment `publisher` and actor ID `2625904`.
- Push only `HEAD:main`, never force-push, and change no repository content.
- Pin every external action to the repository-approved 40-character SHA.

---

### Task 1: Define the failing workflow contract

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Create: `.github/workflows/publisher-verification.yml`

**Interfaces:**
- Consumes: `protectedPublisherJobs`, `pinnedActions`, and `workflow()` from the existing workflow tests.
- Produces: a parsed-YAML contract for job `verify` in `publisher-verification.yml`.

- [ ] **Step 1: Add the missing workflow to the Publisher allowlist and action-pin enumeration**

Add `"publisher-verification": "verify"` and assert an input-free manual trigger,
owner/main guard, environment `publisher`, exact Client ID/private-key inputs,
`git commit --allow-empty`, `git rebase --keep-empty origin/main`, and a
non-force `git push origin HEAD:main`.

- [ ] **Step 2: Run the focused test and observe Red**

Run: `npm.cmd test -- tests/unit/workflows.test.ts`

Expected: FAIL because `.github/workflows/publisher-verification.yml` does not
exist.

- [ ] **Step 3: Add the minimal workflow**

Create an owner-only `workflow_dispatch` workflow with root
`permissions: { contents: read }`, protected environment `publisher`, the
approved token and checkout action pins, an empty audit commit, three bounded
fetch/rebase/push attempts, and no inputs.

- [ ] **Step 4: Run the focused test and observe Green**

Run: `npm.cmd test -- tests/unit/workflows.test.ts`

Expected: PASS with the new workflow included in the direct-writer audit.

### Task 2: Update the reviewed security contract

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-github-contributor-security-policy-design.md`
- Modify: `docs/superpowers/plans/2026-08-16-github-contributor-security-policy.md`

**Interfaces:**
- Consumes: the live Client ID migration already merged in PR 555.
- Produces: documentation that names the current Client ID variable and repeatable canary.

- [ ] **Step 1: Replace stale App ID references**

Document `TAVERNARY_PUBLISHER_CLIENT_ID` as an environment variable and add
`publisher-verification.yml` to the reviewed direct-writer boundary.

- [ ] **Step 2: Run formatting and diff checks**

Run: `npm.cmd run format:check`

Run: `git diff --check`

Expected: both exit zero.

### Task 3: Verify, review, and merge

**Files:**
- Verify: all branch changes

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a merged protected-main verification workflow.

- [ ] **Step 1: Run the full gate**

Run: `npm.cmd run check`

Expected: formatting, lint, catalog validation/build, typecheck, unit tests,
production build, and export verification all pass.

- [ ] **Step 2: Review the complete diff**

Review `origin/main..HEAD` for credential expansion, unpinned actions, force
pushes, extra triggers, or unprotected jobs. Fix every Critical or Important
finding and rerun the gate.

- [ ] **Step 3: Push, open a PR, wait for `verify` and `visual`, and merge**

Merge only the tested head SHA through the protected PR lane and verify the
merge commit is current `main`.

### Task 4: Run positive and negative live verification

**Files:**
- Live GitHub state only

**Interfaces:**
- Consumes: merged `publisher-verification.yml` and ruleset `19711101`.
- Produces: successful App push evidence and rejected ordinary-owner push evidence.

- [ ] **Step 1: Dispatch the Publisher verification workflow from `main`**

Verify token creation uses `client-id`, checkout uses the App token, the empty
commit reaches `main`, and the action post step reports `Token revoked`.

- [ ] **Step 2: Attempt an ordinary owner direct push**

From a disposable detached worktree at current `main`, create an empty commit
and run `git push origin HEAD:main`. Expected: repository rules reject the
update. Remove only the disposable worktree after recording the rejection.

- [ ] **Step 3: Re-read final security state**

Verify ruleset actors/rules, App installation and permissions, environment
policy/credential names, Actions policy, secret scanning, collaborator count,
the verification commit, and downstream push-run conclusions.
