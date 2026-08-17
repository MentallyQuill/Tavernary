# Publisher Automation Branch Custody Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Tavernary Publisher App exclusive custody of generated project-review branches without restricting ordinary contributor branches.

**Architecture:** Main-only generation jobs persist a short-lived Publisher token as their Git credential while ordinary `GITHUB_TOKEN` remains limited to non-content APIs. Admission and triage use Actions-only Publisher tokens, and every privileged target accepts only the owner or Publisher actor. A trusted `pull_request_target` cleanup workflow revalidates exact repository, PR, and ref state before deleting with the App. A narrowly targeted live ruleset then restricts both generated namespaces to the Publisher integration.

**Tech Stack:** GitHub Actions YAML, `actions/create-github-app-token`, Node.js 24 ESM, Vitest, GitHub REST API, GitHub rulesets, GitHub CLI.

## Global Constraints

- Keep `TAVERNARY_PUBLISHER_APP_PRIVATE_KEY` only in the main-only `publisher` environment.
- Use `vars.TAVERNARY_PUBLISHER_CLIENT_ID`; do not use the deprecated App ID input.
- Give the shared `GITHUB_TOKEN` only Contents Read in generation and cleanup workflows.
- Never add GitHub Actions, `MentallyQuill`, or a repository role as a generated-branch bypass actor.
- Reserve `automation/project-submission-0` exclusively for live Publisher verification.
- Leave TavernKeeper source and live settings unchanged.
- Use GitHub CLI with network permission enabled for every remote operation.

---

### Task 1: Define generated-branch custody behavior

**Files:**
- Create: `scripts/security/generated-branch-custody.mjs`
- Create: `scripts/security/generated-branch-custody.d.mts`
- Create: `tests/unit/generated-branch-custody.test.ts`

**Interfaces:**
- Consumes: closed pull-request JSON and exact expected branch/SHA inputs.
- Produces: `planGeneratedProjectBranchCleanup(input)` returning action `delete`, `absent`, or `moved` with the validated branch and SHA.

- [ ] **Step 1: Write failing behavior tests**

Cover an exact same-repository closed PR, absent ref, moved ref, open PR, foreign
head repository, wrong base, mismatched PR head, SHA injection, branch-path
injection, branch zero, and both approved numeric namespace forms. Expected
values must be literal and independent of the implementation.

- [ ] **Step 2: Run the focused test and observe Red**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts`

Expected: FAIL because `scripts/security/generated-branch-custody.mjs` does not
exist.

- [ ] **Step 3: Implement the minimum planner**

Export:

```js
planGeneratedProjectBranchCleanup({
  repository,
  defaultBranch,
  pullNumber,
  expectedBranch,
  expectedHeadSha,
  currentHeadSha,
  pull,
})
```

Accept only positive issue-number branches, lowercase or uppercase 40-character
hex SHAs, a closed same-repository pull request targeting the default branch,
and exact head ref/SHA equality. Return `absent` for no current ref and `moved`
for a changed ref; return `delete` only for complete equality.

- [ ] **Step 4: Run the focused test and observe Green**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts`

Expected: PASS.

### Task 2: Move generation and cleanup Git writes to the Publisher App

**Files:**
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `.github/workflows/generate-project-owner-request.yml`
- Modify: `.github/workflows/admit-issue.yml`
- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/triage-project-owner-request.yml`
- Modify: `.github/workflows/project-submission-lifecycle.yml`
- Modify: `.github/workflows/project-owner-request-lifecycle.yml`
- Create: `.github/workflows/generated-project-branch-cleanup.yml`
- Modify: `tests/unit/generated-branch-custody.test.ts`

**Interfaces:**
- Consumes: the existing main-only `publisher` environment and App credentials.
- Produces: App-authenticated Git branch pushes, App-authenticated trusted dispatches, and exact-state cleanup.

- [ ] **Step 1: Add failing parsed-workflow contracts**

Require both generators to accept only `MentallyQuill` or the Publisher actor,
use environment `publisher`, root Contents Read,
the pinned Publisher token action with Contents Write, and App-token checkout
credentials while retaining ordinary `GH_TOKEN` for Issues/PR/Actions calls.
Require admission and triage to dispatch privileged targets with Actions-only
Publisher tokens and reject shared Actions callers. Require lifecycle workflows
to leave ref cleanup to trusted default-branch code. Require cleanup to run from
`main` via `pull_request_target` or an owner-only manual dispatch, use the
Publisher environment, call the planner, and expose the App token only to the
delete step.

- [ ] **Step 2: Run the focused workflow test and observe Red**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts tests/unit/workflows.test.ts`

Expected: FAIL on the missing App custody and cleanup workflow.

- [ ] **Step 3: Implement App-owned generation**

Add the pinned `actions/create-github-app-token` step before checkout in each
generator, request only `permission-contents: write`, pass the token to checkout,
set the job environment to `publisher`, reduce root Contents to Read, and use the
`Tavernary Publisher` Git identity.

- [ ] **Step 4: Implement main-only App cleanup**

Remove ref mutation from lifecycle jobs. The cleanup workflow runs trusted
default-branch code on closed `pull_request_target` events, re-fetches the
repository default branch plus PR/ref state, invokes the planner, mints the
Publisher token only after a `delete` plan, and performs one exact-SHA
`--force-with-lease` ref delete. Only HTTP 404 is an absent ref; other API errors
fail closed.

- [ ] **Step 5: Run focused tests and observe Green**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts tests/unit/workflows.test.ts tests/unit/project-submission-lifecycle.test.ts tests/unit/project-owner-lifecycle.test.ts`

Expected: PASS.

### Task 3: Add repeatable App branch canary

**Files:**
- Create: `.github/workflows/publisher-automation-branch-verification.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/unit/generated-branch-custody.test.ts`

**Interfaces:**
- Consumes: Publisher Contents-write token and current `main` tree.
- Produces: create/update/delete proof for `automation/project-submission-0`.

- [ ] **Step 1: Add the failing canary contract**

Require an owner-only, input-free, main-only workflow using environment
`publisher`; require an App-created empty commit, ref create, fast-forward ref
update, exact SHA readback, and trap-backed deletion. Require CI publication
dispatch to exclude exactly `automation/project-submission-0`.

- [ ] **Step 2: Run the focused test and observe Red**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts`

Expected: FAIL because the canary workflow and CI exclusion are absent.

- [ ] **Step 3: Implement the canary and CI exclusion**

Use GitHub's Git database API with the Publisher token to create a commit whose
tree equals current `main`, create the reserved ref at current `main`, update it
to the empty child commit with `force=false`, verify the head, and delete it.
Exclude only the reserved branch from automatic publication dispatch.

- [ ] **Step 4: Run focused tests and observe Green**

Run: `npm.cmd test -- tests/unit/generated-branch-custody.test.ts tests/unit/workflows.test.ts`

Expected: PASS.

### Task 4: Verify and merge source hardening

**Files:**
- Verify: all branch changes.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: merged main-only Publisher custody workflows.

- [ ] **Step 1: Run repository verification**

Run: `npm.cmd run format:check`

Run: `npm.cmd run lint`

Run: `npm.cmd run typecheck`

Run: `npm.cmd test`

Run: `git diff --check`

Expected: every command exits zero.

- [ ] **Step 2: Review the complete diff**

Reject credential exposure, pull-request environment access, generic Actions
bypass, unpinned actions, unsafe branch interpolation, non-exact deletion, and
changes outside Tavernary's generated project branch boundary.

- [ ] **Step 3: Push, open a PR, verify checks, and merge**

Push the tested head, open a PR to `main`, wait for required `verify` and
`visual`, merge through the owner PR-only bypass, and verify the merge SHA is
current `main`.

### Task 5: Activate and prove the live ruleset

**Files:**
- Live GitHub state only.

**Interfaces:**
- Consumes: merged workflows and Tavernary Publisher Integration ID `4624827`.
- Produces: active generated-branch ruleset plus positive and negative canaries.

- [ ] **Step 1: Create the narrow active ruleset**

Target only `refs/heads/automation/project-submission-*` and
`refs/heads/automation/project-owner-request-*`; add creation, update, deletion,
and non-fast-forward rules; give only Integration ID `4624827` an `always`
bypass.

- [ ] **Step 2: Run the positive App canary**

Dispatch `publisher-automation-branch-verification.yml` from `main`; verify the
run succeeds, the create/update/delete calls use the Publisher identity, token
revocation succeeds, and the reserved branch is absent afterward.

- [ ] **Step 3: Run the negative ordinary-token canary**

Attempt to create `automation/project-submission-0` from current `main` using
the authenticated `MentallyQuill` Git credential. Expected: GitHub rejects the
push under the generated-branch ruleset and no ref is created.

- [ ] **Step 4: Re-audit both repositories**

Verify Tavernary's new ruleset target/rules/bypass, unchanged `main` ruleset,
ordinary feature-branch freedom, pending automation branch coverage, main-only
Publisher environment, and absent reserved canary ref. Verify TavernKeeper has
only its existing `main` ruleset and no generated automation branches.
