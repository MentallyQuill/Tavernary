# Tavernary GitHub-only Longevity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the user selects delegated execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete approved GitHub-only longevity overhaul, submit the necessary PRs, resolve CI/review/merge challenges, merge every required stage, and verify production before completing the active goal.

**Architecture:** Testable shared failure, operation, publication, deployment, and budget contracts coordinate existing domain automation. GitHub remains the control plane, state store, host, and retained-artifact location. Events wake durable reconciliation, and canonical mutations share a serialized lane.

**Tech Stack:** Node.js 24; ESM `.mjs`/`.d.mts`; TypeScript; Ajv; Vitest; Playwright; static Next.js; GitHub CLI, Actions, Pages, issues, PRs, artifacts, and releases.

**Spec:** [Approved design](../specs/2026-10-07-unattended-operation-design.md), approved by the user on 2026-10-07.

## Global Constraints

Every linked plan inherits the approved specification. No external watchdog,
off-site backup, new database, or new hosting service is included. Preserve
manual decisions and existing authority/contract protections. Automatic discovery
is conditional and has not been selected. The preflight production baseline was
`a7139759edfb253bfeb43e6196ff00a7c7f07eb3`; use later main revisions when
integrating rather than deploying an obsolete baseline.

Worktree: `C:/Users/Keptin/.codex/worktrees/tavernary-longevity/Tavernary`.
Initial branch: `codex/tavernary-longevity`; follow-up delivery is recorded in the ledger. Original user changes remain in
`F:/git/Tavernary`.

GitHub calls use `gh` with network permission enabled. If authentication
expires, request reauthentication. Never print tokens/private keys or weaken
rulesets to satisfy CI. Main currently requires `verify` and `visual`,
one approving review, last-push approval, resolved threads, and up-to-date
checks; the configured Publisher integration has the existing bypass lane.
Inspect current settings again before automated merges.

## Review Focus

- A user edits or loses authority after preparation: reread mutable facts immediately before publication.
- A cancelled worker has already merged: reconstruct canonical state before retrying.
- A newer deployment contains an owner delist: stale deployment/rollback must not resurrect it.
- Provider errors occur after a budget reservation: keep conservative accounting and do not overspend on replays.
- A receipt is pruned or a dispatch is dropped: authoritative reconstruction must still recover or prove completion.

## Plans and dependencies

Execute the plans in this order. Each produces working, independently tested
behavior; none reduces the final goal's scope.

| Phase | Plan                                                              | Depends on               | Acceptance coverage     |
| ----- | ----------------------------------------------------------------- | ------------------------ | ----------------------- |
| 1     | [Failure recovery](2026-10-07-longevity-failure-recovery.md)      | Clean baseline           | R1, R4, R5              |
| 2     | [Durable reconciliation](2026-10-07-longevity-reconciliation.md)  | Phase 1 contracts        | R2, R3, R4, R5          |
| 3     | [Publication and deployment](2026-10-07-longevity-publication.md) | Phase 2 identities/state | R5, R6, R7, R8, R9, R10 |
| 4     | [Metadata and budgets](2026-10-07-longevity-metadata.md)          | Phase 3 writer           | R12, R13                |
| 5     | [Maintenance and operations](2026-10-07-longevity-maintenance.md) | Phases 2-4               | R11, R14, R15, R16, R17 |
| 6     | [Integration and merge](2026-10-07-longevity-integration.md)      | All implementations      | R1-R18                  |

## Baseline and execution setup

Read-only observations are recorded in [preflight evidence](2026-10-07-longevity-preflight.md). They do not satisfy implementation or completion gates.

- [x] User approved all linked plans on 2026-10-07 and selected inline implementation with independent branch review.
- [x] Record `git status`, main SHA, runtime, and original-checkout status.
- [x] Install the committed lockfile using `npm ci` in the managed worktree (exit 0).
- [x] Read installed static-export and testing guides in `node_modules/next/dist/docs/`.
- [x] Run `npm run check` and every baseline browser/visual command from CI on Windows (all exit 0); actual Linux/Windows CI remains an integration gate.
- [x] Baseline checks passed; investigate any later failures using systematic debugging; preserve the
      design and required checks. Keep baseline evidence separate from regressions.
- [x] Create the [requirement-evidence ledger](../../maintenance/longevity-verification.md) linked from this master plan.
      Record concrete commits, commands, PRs, live runs, and verified public revisions.

## Delivery and completion

The [current verification ledger](../../maintenance/longevity-verification.md)
records the exact checked and merged implementation heads, native public proof,
recovery canary effects, supported-runtime results, retained-release drill and
owner responsibilities. Its current requirement table supersedes the historical
checkpoints in the linked pre-closure ledger and Git history. The original
checkout remains preserved.

Use reviewable stage PRs when it reduces integration risk; retain the master
specification, plan links, and ledger through each merged stage. Keep later
branches based on current main. If a single coherent PR is required by
coupled migration, preserve the same intermediate test/commit boundaries.

Every implementation PR must be submitted and attached to this task. Watch
the exact checked head, fix actual failures, resolve feedback and conflicts,
and merge without weakening required gates. The user's goal explicitly
authorizes working through merge; do not stop at opening a PR.

For each R1-R18 row in the approved design, the final ledger must identify
authoritative evidence. Missing evidence means unfinished work. GitHub outage
observation from outside GitHub and off-site backups are explicitly excluded
by the user's scope correction.

## Execution handoff

Native execution is recommended because the shared operation and publication
contracts tightly couple these phases. The main agent implements the tasks
and obtains independent review before merge. Delegated execution is available
if the user prefers per-task implementer/reviewer gates. Review all linked
plans before selecting the method; selecting it authorizes their execution
through CI, merge, and production verification under the approved scope.
