# TavernKeeper Cross-Repository Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the completed TavernKeeper and Tavernary implementations, prove their public contracts and wake-ups against live GitHub Pages, and roll scanning out through fixtures, staff canaries, one five-repository batch, and the catalog backlog.

**Architecture:** Each repository is built and tested independently before credentials are connected. Public Pages JSON remains authoritative in both directions; destination-only GitHub Apps merely dispatch input-free reconciliation workflows, and every rollout phase has a stop/go evidence gate that prevents incomplete or degraded reports from becoming public.

**Tech Stack:** Git, GitHub CLI, GitHub Actions, GitHub Apps, GitHub Pages, Tavernary, TavernKeeper, MiniMax M3

## Global Constraints

- Execute the TavernKeeper scanner plan before enabling live publication: `docs/superpowers/plans/2026-07-31-tavernkeeper-scanner-implementation.md`.
- Execute the Tavernary integration plan before enabling live import/UI: `docs/superpowers/plans/2026-07-31-tavernary-tavernkeeper-integration.md`.
- Treat the written design as authoritative: `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md`.
- Do not delete or conceal the frozen premature implementation. Reconcile it explicitly on implementation branches and retain normal Git history.
- Do not publish a report until all applicable scanners and MiniMax complete and the sanitizer accepts it.
- Do not lower coverage, change models, skip eligible files, or convert an error into green/yellow during rollout.
- Use no more than five repositories in a batch and no more than two concurrent repository scan jobs.
- Only TavernKeeper staff may initiate manual retry, deep scan, policy rescan, pause/resume, oversized scan, or adjudication.
- Do not notify external repository owners of operational failures.
- Preserve report immutability and exact-SHA identity through every canary and recovery exercise.
- Use GitHub CLI with authenticated network access for repository, Actions, Pages, environment, secret, issue, and workflow verification.

---

## Plan Order

1. Reconcile the frozen branches/workspaces without dropping work.
2. Complete TavernKeeper Tasks 1-12 through local publisher tests.
3. Complete Tavernary Tasks 1-3 through static target/import/status tests.
4. Exchange and certify V1 schemas/fixtures.
5. Complete TavernKeeper Tasks 13-15 and Tavernary Tasks 4-8.
6. Create/configure the public TavernKeeper GitHub repository, Apps, environments, labels, Pages, and secrets.
7. Deploy contracts only, then fixtures, staff canaries, one mixed five-repository batch, and the initial backlog.
8. Enable normal wake-ups, then staff-only deep scanning.

---

### Task 1: Reconcile the Frozen Work Without Hiding It

**Files:**
- Tavernary branch: `feature/tavernkeeper-integration`
- Tavernary design branch: `design/tavernkeeper-spec`
- TavernKeeper current repository: `F:\git\TavernKeeper`
- TavernKeeper frozen untracked files: `src/model/minimax-review.ts`, `src/orchestrator/scan-handler.ts`, `tests/minimax-review.test.ts`, `tests/scan-handler.test.ts`

**Interfaces:**
- Produces one intentional implementation branch per repository with approved design/plan history available to its implementer.
- No frozen commit or untracked file is silently discarded.

- [ ] **Step 1: Inventory exact starting state before changing branches**

Run in Tavernary:

```powershell
git worktree list --porcelain
git status -sb
git -C F:\git\Tavernary\.worktrees\tavernkeeper-integration status -sb
git -C F:\git\Tavernary\.worktrees\tavernkeeper-integration log -3 --oneline
```

Run in TavernKeeper:

```powershell
git status -sb
git log --oneline --decorate --all
git ls-files --others --exclude-standard
```

Expected: Tavernary still exposes `174bf44f`; TavernKeeper still exposes `00b24e2`, `360c57a`, and the four named untracked partial files.

- [ ] **Step 2: Use the worktree skill to prepare execution isolation**

Invoke `superpowers:using-git-worktrees`. For Tavernary, use the existing feature worktree only after the skill verifies it is safe and bring the approved spec/plans into that branch with a normal merge or cherry-pick. For TavernKeeper, switch the current checkout to a new `feature/tavernkeeper-v1` branch, stage the four frozen untracked files unchanged, and commit them as `chore: preserve frozen partial implementation`; then return the primary checkout to clean `main` and let the skill create an isolated worktree for the feature branch.

- [ ] **Step 3: Record the reconciliation in Git history**

Tavernary expected history contains both the frozen target commit and approved design/plan commits. TavernKeeper expected history contains the two frozen commits plus an explicitly named preservation commit if the previously untracked files had to be staged.

- [ ] **Step 4: Verify no unrelated Tavernary state moved**

The original Tavernary `main` worktree's active cherry-pick and unrelated untracked design file remain untouched. Stop if their status changes.

### Task 2: Certify the Cross-Repository V1 Contract Pair

**Files:**
- TavernKeeper: `schemas/tavernary-targets.v1.schema.json`
- TavernKeeper: `schemas/report-index.v1.schema.json`
- TavernKeeper: `tests/fixtures/contracts/*.valid.json`
- Tavernary: `data/schemas/tavernkeeper-targets.schema.json`
- Tavernary: `data/schemas/tavernkeeper-report-index.schema.json`
- Tavernary: `tests/fixtures/tavernkeeper/report-index.valid.json`
- Both repositories' contract tests

**Interfaces:**
- Tavernary owns target schema/fixture semantics.
- TavernKeeper owns report-index schema/fixture semantics.
- Each consumer vendors the producer's exact V1 file and rejects unknown versions/fields.

- [ ] **Step 1: Compare the schema and fixture digests**

```powershell
Get-FileHash F:\git\Tavernary\data\schemas\tavernkeeper-targets.schema.json -Algorithm SHA256
Get-FileHash F:\git\TavernKeeper\schemas\tavernary-targets.v1.schema.json -Algorithm SHA256
Get-FileHash F:\git\Tavernary\data\schemas\tavernkeeper-report-index.schema.json -Algorithm SHA256
Get-FileHash F:\git\TavernKeeper\schemas\report-index.v1.schema.json -Algorithm SHA256
```

Expected: each producer/consumer pair has the same digest. If naming wrappers differ, compare canonical JSON output and require structural equality in tests.

- [ ] **Step 2: Run each repository's contract tests independently**

Run in TavernKeeper: `npm test -- tests/contracts.test.ts`

Run in Tavernary: `npm test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/tavernkeeper-reports.test.ts`

Expected: both accept the shared valid fixtures and reject unknown fields, wrong versions, duplicate identities, invalid SHAs, unsafe URLs, and result vocabulary outside green/yellow.

- [ ] **Step 3: Exercise forward-version rejection deliberately**

Change only `schema_version` in an in-memory fixture to 2 in each consumer test. Expected: strict rejection with the previous tracked/public data preserved.

- [ ] **Step 4: Commit any parity-only corrections before workflow work**

Use `fix(contracts): align TavernKeeper V1 schemas` only if the comparison found a real mismatch; otherwise create no empty commit.

### Task 3: Create and Protect the Public TavernKeeper Repository

**Files:**
- TavernKeeper Git repository metadata and GitHub settings
- TavernKeeper `LICENSE`, `README.md`, `SECURITY.md`

**Interfaces:**
- Produces public `MentallyQuill/TavernKeeper` with normal `main`, GitHub Actions, GitHub Pages, Issues, and protected staff environment.

- [ ] **Step 1: Verify whether the remote repository already exists**

Run: `gh repo view MentallyQuill/TavernKeeper --json nameWithOwner,url,visibility,defaultBranchRef`

Expected: either a public repository with default `main`, or a not-found response that authorizes the next already-approved creation step.

- [ ] **Step 2: Create the repository only if absent and attach `origin`**

```powershell
gh repo create MentallyQuill/TavernKeeper --public --source F:\git\TavernKeeper --remote origin --description "Advisory exact-commit security scanning for Tavernary projects"
git -C F:\git\TavernKeeper remote -v
```

- [ ] **Step 3: Push only the reviewed implementation branch**

Run: `git push -u origin feature/tavernkeeper-v1`

Expected: no direct unreviewed push to `main` and no report paths before publisher gates pass.

- [ ] **Step 4: Configure repository governance**

Enable Issues and Pages through Actions. Create label `scanner-operations`. Create protected environments `tavernkeeper-scanner` and `tavernkeeper-staff`; restrict both to protected `main`, require TavernKeeper staff reviewers on `tavernkeeper-staff`, and require no reviewer on the automatic scanner environment. Protect `main` with pull requests plus required TavernKeeper CI, do not require linear history, and disallow force pushes and branch deletion. Allow the trusted publication workflow actor to bypass only the pull-request requirement needed to commit reports and operational state; scan jobs retain read-only permissions.

- [ ] **Step 5: Verify public licensing and security entry points**

Run: `gh api repos/MentallyQuill/TavernKeeper/license --jq .license.spdx_id`

Expected: `AGPL-3.0`. README and SECURITY explicitly describe advisory-only results, no public scan requests, and the appeal process.

### Task 4: Create the Two Destination-Only GitHub Apps and Secrets

**Files:**
- GitHub App settings
- Tavernary Actions secrets
- TavernKeeper Actions secrets

**Interfaces:**
- App A: Tavernary credential, installed only on TavernKeeper, repository `Actions: write` and Metadata read.
- App B: TavernKeeper credential, installed only on Tavernary, repository `Actions: write` and Metadata read.

- [ ] **Step 1: Create App A with no webhook and no callback URL requirement**

Name it `Tavernary Wake TavernKeeper`. Grant repository Actions read/write and mandatory Metadata read only. Disable webhook delivery. Install it only on `MentallyQuill/TavernKeeper`.

- [ ] **Step 2: Store App A credentials only in Tavernary**

```powershell
gh secret set TAVERNKEEPER_WAKE_APP_ID --repo MentallyQuill/Tavernary
gh secret set TAVERNKEEPER_WAKE_APP_PRIVATE_KEY --repo MentallyQuill/Tavernary
```

Enter values through the CLI's protected prompt/stdin mechanism; never place the private key in shell history, a file, an issue, or a report.

- [ ] **Step 3: Create App B with the reciprocal installation**

Name it `TavernKeeper Wake Tavernary`. Grant the same narrow permissions, disable webhooks, and install it only on `MentallyQuill/Tavernary`.

- [ ] **Step 4: Store App B credentials only in TavernKeeper**

```powershell
gh secret set TAVERNARY_WAKE_APP_ID --repo MentallyQuill/TavernKeeper
gh secret set TAVERNARY_WAKE_APP_PRIVATE_KEY --repo MentallyQuill/TavernKeeper
```

- [ ] **Step 5: Store MiniMax in the two purpose-specific protected environments**

```powershell
gh secret set MINIMAX_API_KEY --repo MentallyQuill/TavernKeeper --env tavernkeeper-scanner
gh secret set MINIMAX_API_KEY --repo MentallyQuill/TavernKeeper --env tavernkeeper-staff
```

The automatic environment has no required reviewer and accepts only protected `main`; the staff environment requires TavernKeeper staff approval for deep, policy, oversized, and adjudication workflows. The MiniMax secret never exists in Tavernary and appears only on the provider-request step.

- [ ] **Step 6: Verify installation scope through GitHub API**

Confirm each App has exactly one repository installation and no Contents write permission. Capture app slug, installation repository, and permission JSON in the private rollout record without private keys.

### Task 5: Deploy Public Contracts Without Scanning Targets

**Files:**
- Tavernary Pages target manifest
- TavernKeeper Pages empty report index and schemas

**Interfaces:**
- Public target URL: `https://tavernary.org/security/tavernkeeper-targets.json`.
- Public report index: `https://mentallyquill.github.io/TavernKeeper/reports/index.json`.

- [ ] **Step 1: Pause TavernKeeper operations before first Pages deployment**

Set `operations/state.json` to a staff pause with an empty retry list and deploy the empty, schema-valid `reports/index.json`. Paused reconciliation may fetch/plan but must dispatch no scan jobs.

- [ ] **Step 2: Deploy TavernKeeper Pages and verify exact public files**

Trigger the Pages workflow on the reviewed commit. Watch it to completion with `gh run watch`. Fetch the public index and schemas freshly, verify content type/status/body size, and validate them with Tavernary's importer without writing.

- [ ] **Step 3: Deploy Tavernary's target manifest and verify exact public files**

Trigger Tavernary Pages on the reviewed commit, watch it, fetch the public target manifest freshly, and validate it with TavernKeeper's parser. Confirm only healthy public GitHub sources appear and every SHA equals the matching Tavernary snapshot.

- [ ] **Step 4: Prove scheduled fallbacks while scans remain paused**

Dispatch both input-free reconciliation workflows manually and confirm they fetch public contracts, accept them, and perform zero scans/commits because TavernKeeper is paused and the index has no imported changes.

### Task 6: Run Hostile Fixtures and Staff-Owned Canary Repositories

**Files:**
- TavernKeeper fixture reports
- Staff-owned canary repositories
- Tavernary imported canary card state

**Interfaces:**
- Produces manually reviewed green/yellow evidence without exposing seeded secrets or executing fixture content.

- [ ] **Step 1: Run local hostile fixtures again on the exact release commit**

Run: `npm run check && npm run test:e2e && npm run build`

Expected: all gates pass, no execution marker exists, no seeded secret appears in logs/cache/report/HTML, and every forced failure produces no report.

- [ ] **Step 2: Create or select two staff-owned public canaries**

Use one benign small repository and one intentionally suspicious repository containing inert credential-access-plus-network, install-hook, workflow, encoded-payload, and fake-secret examples. No canary contains a real credential or reusable malware payload.

- [ ] **Step 3: Add canaries through Tavernary's normal staff-reviewed catalog path**

Do not call TavernKeeper directly. Publish Tavernary's manifest, verify the exact canary SHAs are live, and allow the Tavernary wake or six-hour fallback to reconcile them.

- [ ] **Step 4: Resume automatic operations for canaries only**

Use the protected staff workflow to resume, while a temporary staff policy campaign restricts desired work to the two canary repository IDs. Confirm maximum parallel two and no public requester input.

- [ ] **Step 5: Inspect every canary artifact before expanding**

Verify checkout SHA, all applicable scanner coverage, MiniMax chunk completeness, actual usage totals, redaction, result threshold, immutable path, static HTML, report-index preference, Pages bytes, TavernKeeper wake, Tavernary import, and exact card shield/popover.

- [ ] **Step 6: Exercise one transient failure**

Use a provider/scanner test double or staff canary mode that fails without consuming a real target. Confirm attempts at `T+1`, `T+2`, and success before `T+3` produce no staff issue or external-owner notification, clear silently, and resume backlog draining.

### Task 7: Run the Approved Mixed Five-Repository Batch

**Files:**
- Live Tavernary target manifest
- Live TavernKeeper reports/index
- Live Tavernary catalog import

**Interfaces:**
- Exactly five selected repositories; at most two scan jobs active concurrently.

- [ ] **Step 1: Select five staff-reviewed targets of varied size and content**

Choose one small source-only project, one dependency-heavy project, one GitHub-Actions-heavy project, one archive/binary-bearing project, and one larger text-heavy project. Record exact repository IDs and SHAs from the public Tavernary manifest.

- [ ] **Step 2: Run one reconciliation batch and watch all jobs**

Use `gh run watch` and `gh run view --json jobs` to verify the planner selected no more than five and the matrix never had more than two in progress. Confirm no target SHA changed between plan and pre-model freshness check.

- [ ] **Step 3: Verify repository-specific isolation**

If a controlled repository-specific failure is included, confirm its report is absent while unrelated complete candidates publish. If no controlled failure is used in the live batch, retain the hostile-fixture proof as the release evidence.

- [ ] **Step 4: Verify Pages and Tavernary UI for all five**

Fresh-fetch each immutable report URL and the report index. Confirm Tavernary imports only matching identities/SHAs and displays green/yellow or gray exactly as appropriate. Confirm no shield appears on an unsupported source card.

- [ ] **Step 5: Record go/no-go evidence**

Required go evidence: five-or-fewer target selection, two-or-fewer concurrency, complete scanner/model coverage, no source execution, no secret/source excerpts, correct preferred index, successful wake/import, inline title shields, concise popovers, and no operational issue.

### Task 8: Drain the Initial Catalog Backlog Safely

**Files:**
- TavernKeeper operational state and reports
- Tavernary imported summaries

**Interfaces:**
- Self-continuing five-repository batches until desired current targets minus reports is empty.

- [ ] **Step 1: Remove the five-target campaign restriction**

Keep the permanent batch size five and maximum parallel two. Allow new projects first, changed projects second, due retries third, and staff policy campaigns fourth, with age boost.

- [ ] **Step 2: Observe at least two continuation batches**

Confirm the publisher recomputes the backlog from public manifest/index, dispatches an input-free continuation only when work remains, and coalesces repositories that changed SHA before their turn.

- [ ] **Step 3: Verify large-repository behavior**

Confirm a larger repository generates additional MiniMax chunks rather than an aggregate cap or preflight token-budget failure. If it exceeds a security ceiling, confirm it publishes nothing and enters the staff-only oversized path without blocking unrelated repositories.

- [ ] **Step 4: Confirm empty-backlog stability**

When caught up, a wake and scheduled reconciliation produce an empty plan, zero MiniMax calls, zero report commit, and zero Tavernary wake.

### Task 9: Enable and Prove Normal Bidirectional Wake-Ups

**Files:**
- Tavernary deploy workflow run
- TavernKeeper reconcile/deploy workflow run
- Tavernary import/deploy workflow run

**Interfaces:**
- Both wakes are input-free and non-authoritative; six-hour schedules remain enabled.

- [ ] **Step 1: Prove Tavernary-to-TavernKeeper live sequence**

Publish one staff-approved project SHA change in Tavernary. Verify Tavernary Pages first serves the new manifest digest, then App A dispatches TavernKeeper reconciliation, and TavernKeeper independently fetches the public manifest.

- [ ] **Step 2: Prove TavernKeeper-to-Tavernary live sequence**

After the complete report index is live, verify App B dispatches Tavernary's input-free import, Tavernary independently fetches/validates it, commits only the sanitized local summaries, and deploys the matching card state.

- [ ] **Step 3: Prove missed-wake recovery in both directions**

Temporarily disable each App credential one at a time on a staff canary change. Confirm the valid Pages deployment remains successful with a warning, no malformed payload is trusted, and the next six-hour-equivalent manual schedule invocation reconciles the change. Restore the secret immediately after each controlled test.

### Task 10: Rehearse Terminal Failure, Staff Recovery, Appeal, and Deep Scan

**Files:**
- TavernKeeper operational issue/state
- Immutable original and superseding reports
- Tavernary imported preferred summary

**Interfaces:**
- Produces verified operator procedures for the remaining privileged paths.

- [ ] **Step 1: Rehearse a terminal system-wide failure with test credentials**

In an isolated staff canary mode, force the same provider authentication error through initial, `T+1`, `T+2`, and `T+3`. Confirm no report publishes, later batches remain stopped, intermediate attempts notify no one, and only exhaustion fails visibly and creates/updates one `scanner-operations` issue.

- [ ] **Step 2: Restore and explicitly resume**

Correct the test configuration, run the staff recovery check, close or annotate the incident, explicitly resume, and confirm the target restarts from its first uncached chunk while completed sanitized cache entries remain usable.

- [ ] **Step 3: Rehearse a false-positive appeal without scanning**

Submit the Issue Form with a canary immutable report and fingerprint. Confirm no workflow scan starts. Use protected adjudication to dismiss the finding; verify a new report version supersedes the old one, old URLs remain unchanged, and Tavernary imports the new preferred result.

- [ ] **Step 4: Run one staff-only deep scan**

Use a canary with multiple first-party text files. Confirm every eligible file is represented in valid MiniMax chunks, excluded categories are counted, no aggregate token cap appears, the deep report becomes preferred, and the standard report remains immutable/addressable.

### Task 11: Final Cross-Repository Acceptance and Handoff

**Files:**
- Both repositories' release branches and live Pages deployments
- Final evidence record in the implementation handoff

**Interfaces:**
- Completion requires source, tests, exact deployment SHAs, public contract bytes, live workflow handshake, and hydrated card behavior.

- [ ] **Step 1: Capture source and Git state**

For each repository record clean status, branch, local SHA, remote SHA, PR/merge state, and the exact commit that Pages deployed. Do not conflate a passing branch with a merged/deployed commit.

- [ ] **Step 2: Capture complete automated verification**

TavernKeeper: `npm run check && npm run test:e2e && npm run build`.

Tavernary: `npm run check && npm run test:e2e && npm run test:visual && npm run build:test-kits && npm run test:kits-e2e && npm run test:kits-visual`.

- [ ] **Step 3: Capture fresh live HTTP and workflow evidence**

Fresh-fetch Tavernary target manifest, TavernKeeper report index, one green report, one yellow report, and Tavernary catalog/UI. Record status, content type, digest, identity/SHA, and cache-busting request time. Record both wake workflow chains and one scheduled fallback chain.

- [ ] **Step 4: Confirm every definition-of-done statement**

Require all twelve statements in Section 24 of the approved design to have direct evidence. Any missing proof leaves rollout incomplete even if individual tests pass.

- [ ] **Step 5: Hand off normal operations**

Provide TavernKeeper staff with pause/resume/retry/deep/policy/oversized/adjudication procedures, current scanner/model/policy versions, current backlog/oldest age, token usage, incident state, App installation scope, secret rotation schedule, and links to public contracts/reports. External project owners receive no operational-failure notifications.
