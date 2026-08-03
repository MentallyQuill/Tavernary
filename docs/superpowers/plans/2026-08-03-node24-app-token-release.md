# Node 24 GitHub App Token Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every production `actions/create-github-app-token` Node 20 pin in Tavernary and TavernKeeper with the immutable Node 24 v3.0.0 commit, certify the live token path without changing scan behavior or output, and resume the paused all-project scan queue.

**Architecture:** Keep the change entirely in the GitHub Actions control plane. Update the exact-action policy tests before the workflow YAML so each repository demonstrates RED against the old pin and GREEN against `f8d387b68d61c58ab83c6c016672934102569859`; do not modify scanner code, scanner policy, report schemas, reports, assessments, queue selection, or generated catalog data. Merge and push both verified branches, certify the TavernKeeper Pages token path with an exact-commit deployment, then use the protected staff operation to resume the existing queue.

**Tech Stack:** GitHub Actions YAML, immutable action SHAs, TypeScript, Vitest, GitHub CLI, Git worktrees.

## Global Constraints

- The approved action is `actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859`, the official v3.0.0 Node 24 release.
- Preserve every existing App ID, private key, owner, repository, permission, environment, and fail-closed consumer boundary.
- Do not add GitHub App client-ID secrets; v3.0.0 intentionally retains the existing `app-id` contract without a second deprecation warning.
- Do not change scan behavior or scan output.
- If any scanner, policy, report, assessment, generated-catalog, or queue-selection file changes, stop before deployment and reset both Wandlight and Recursion to zero scan history before continuing.
- When the diff remains workflow-and-test-only, preserve the existing Wandlight and Recursion reports and history.
- Do not touch the unrelated embedded checkout at `F:\git\TavernKeeper\TavernKeeper` or unrelated registered worktrees.
- Use GitHub CLI with network permission for all GitHub reads, dispatches, and verification.

---

### Task 1: Upgrade Tavernary's App-token action policy

**Files:**
- Modify: `F:\git\Tavernary\.worktrees\node24-action-pin\tests\unit\workflows.test.ts`
- Modify: `F:\git\Tavernary\.worktrees\node24-action-pin\tests\unit\tavernkeeper-token-policy.test.ts`
- Modify: `F:\git\Tavernary\.worktrees\node24-action-pin\.github\workflows\deploy-pages.yml`
- Modify: `F:\git\Tavernary\.worktrees\node24-action-pin\.github\workflows\targeted-tavernkeeper-scan.yml`

**Interfaces:**
- Consumes: the existing `TAVERNKEEPER_WAKE_APP_ID` and `TAVERNKEEPER_WAKE_APP_PRIVATE_KEY` secrets and the destination-only Actions permission contract.
- Produces: two Tavernary workflows pinned to the reviewed Node 24 action while preserving opaque token transport to the existing GitHub CLI consumers.

- [ ] **Step 1: Change the two test constants to the approved SHA**

Replace the old SHA in `pinnedActions["actions/create-github-app-token"]` and `appTokenAction` with:

```ts
"actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859";
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/tavernkeeper-token-policy.test.ts
```

Expected: failures identify the two workflow steps still pinned to `fee1f7d63c2ff003460e3d139729b119787bc349`; the token-policy test must also stop counting the old action as the reviewed token producer.

- [ ] **Step 3: Update the two production workflow pins**

In both workflow files, replace the old action use with:

```yaml
uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3.0.0
```

Do not change any `with`, `env`, `if`, `continue-on-error`, permission, or consumer lines.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/tavernkeeper-token-policy.test.ts
```

Expected: 42 tests pass with zero failures.

- [ ] **Step 5: Prove the Tavernary scope is control-plane-only**

Run:

```powershell
git diff --name-only
rg -n "fee1f7d63c2ff003460e3d139729b119787bc349" .github tests
rg -n "f8d387b68d61c58ab83c6c016672934102569859" .github tests
```

Expected: only the plan, two workflow files, and two tests are modified; the old SHA has no active workflow/test matches; the new SHA appears in exactly four active locations. No scan-history reset is required.

- [ ] **Step 6: Commit Tavernary's tested change**

```powershell
git add docs/superpowers/plans/2026-08-03-node24-app-token-release.md tests/unit/workflows.test.ts tests/unit/tavernkeeper-token-policy.test.ts .github/workflows/deploy-pages.yml .github/workflows/targeted-tavernkeeper-scan.yml
git commit -m "fix(actions): use Node 24 App tokens"
```

### Task 2: Upgrade TavernKeeper's App-token action policy

**Files:**
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\tests\workflows.test.ts`
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\tests\token-policy.test.ts`
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\.github\workflows\deploy-pages.yml`
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\.github\workflows\policy-rescan.yml`
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\.github\workflows\scan-and-publish.yml`
- Modify: `F:\git\TavernKeeper\.worktrees\node24-action-pin\.github\workflows\staff-operations.yml`

**Interfaces:**
- Consumes: the existing TavernKeeper Publisher and Tavernary wake App IDs/private keys, protected environments, and least-privilege repository scopes.
- Produces: four TavernKeeper workflows pinned to the reviewed Node 24 action while preserving the existing Publisher commit boundary and Tavernary importer wake path.

- [ ] **Step 1: Change the two test constants to the approved SHA**

Replace the old SHA in `publisherAction` and `appTokenAction` with:

```ts
"actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859";
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/workflows.test.ts tests/token-policy.test.ts
```

Expected: failures identify the old action in the Publisher token step and stop counting the four old action steps as reviewed producers.

- [ ] **Step 3: Update the four production workflow pins**

In all four workflow files, replace the old action use with:

```yaml
uses: actions/create-github-app-token@f8d387b68d61c58ab83c6c016672934102569859 # v3.0.0
```

Do not change any App secret, environment, permission, condition, token consumer, report, operation, or scan command.

- [ ] **Step 4: Run the focused tests and workflow policy and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/workflows.test.ts tests/token-policy.test.ts
npm.cmd run workflows:check
```

Expected: 17 focused tests pass and the policy reports `Workflow policy passed for 9 workflows`.

- [ ] **Step 5: Prove the TavernKeeper scope is control-plane-only**

Run:

```powershell
git diff --name-only
rg -n "fee1f7d63c2ff003460e3d139729b119787bc349" .github tests
rg -n "f8d387b68d61c58ab83c6c016672934102569859" .github tests
```

Expected: only four workflow files and two tests are modified; the old SHA has no active workflow/test matches; the new SHA appears in exactly six active locations. No file under `src`, `config`, `rules`, `schemas`, `operations`, or `reports` changes, so Wandlight and Recursion remain untouched.

- [ ] **Step 6: Commit TavernKeeper's tested change**

```powershell
git add tests/workflows.test.ts tests/token-policy.test.ts .github/workflows/deploy-pages.yml .github/workflows/policy-rescan.yml .github/workflows/scan-and-publish.yml .github/workflows/staff-operations.yml
git commit -m "fix(actions): use Node 24 App tokens"
```

### Task 3: Verify, publish, certify, and resume production scanning

**Files:**
- Verify only: both isolated worktrees and both primary `main` checkouts.
- External state: Tavernary and TavernKeeper `main`, GitHub Actions, TavernKeeper Pages, and `operations/state.json`.

**Interfaces:**
- Consumes: the two clean commits from Tasks 1 and 2 and the existing protected GitHub environments.
- Produces: warning-free Node 24 token execution, an unpaused TavernKeeper queue with `coverage_started_at` set, and reconciliation proceeding in the existing priority order.

- [ ] **Step 1: Run both full local release gates**

Run in the Tavernary worktree:

```powershell
npm.cmd run check
```

Run in the TavernKeeper worktree:

```powershell
npm.cmd run check
```

Expected: both commands exit 0; Tavernary passes its full site/export/test gate and TavernKeeper passes formatting, typecheck, tests, and workflow policy.

- [ ] **Step 2: Recheck the no-reset guard before integration**

Run `git diff main...HEAD --name-only` in each worktree. Expected: Tavernary contains only its plan, two tests, and two workflows; TavernKeeper contains only two tests and four workflows. If any scan behavior/output path appears, stop and reset Wandlight and Recursion before any push or resume.

- [ ] **Step 3: Fast-forward each primary main and push it**

After confirming each primary checkout has no new tracked changes, fast-forward TavernKeeper `main` to its branch, push `main`, then fast-forward Tavernary `main` to its branch and push `main`. Preserve the unrelated untracked embedded TavernKeeper checkout.

- [ ] **Step 4: Wait for exact-commit CI and Pages results**

Use `gh run list`, `gh run view`, and Pages deployment records to prove each pushed SHA completed its required workflows. Tavernary's workflow-only deployment must leave the published target manifest and imported canary data unchanged.

- [ ] **Step 5: Certify the warning-free TavernKeeper token path**

Dispatch `deploy-pages.yml` on TavernKeeper `main` with `source_sha` equal to the newly pushed TavernKeeper full SHA. Wait for the exact run to complete, verify the `Create Tavernary wake token` step succeeds, and query the deploy job annotations. Expected: no Node 20 deprecation annotation and no `app-id` deprecation annotation.

- [ ] **Step 6: Resume the protected queue**

Dispatch TavernKeeper `staff-operations.yml` on `main` with `operation=resume`. Wait for the protected operation to succeed; this run is the live certification of the Publisher token path used by `staff-operations`.

- [ ] **Step 7: Verify production state and first-priority reconciliation**

Confirm remote `operations/state.json` has `pause: null`, non-null `coverage_started_at`, no circuit breaker, and no unexpected retry state. Confirm the resulting reconciliation begins with eligible Top-30 work before new-submission and old-project lanes. Verify Wandlight and Recursion retained their existing report/history artifacts because no scan behavior or output changed.

- [ ] **Step 8: Record final evidence**

Report both pushed SHAs, full local gates, exact GitHub Actions URLs, warning-free annotations, the staff-resume run, the resulting queue state, and whether the first priority batch started. Do not claim full release until all evidence is terminal and current.
