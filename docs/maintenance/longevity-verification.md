# Tavernary longevity verification ledger

The user approved the GitHub-only design and all implementation plans on
2026-10-07, choosing inline implementation with independent branch review.
External watchdogs and off-site backups are explicitly excluded. Unknown-project
discovery has not been selected. Completion requires all approved changes,
attached PRs, required checks, independent review, merge, and production proof.

## Execution baseline

- Production base: `a7139759edfb253bfeb43e6196ff00a7c7f07eb3`.
- Initial implementation head: `0a1963e7b` on `codex/tavernary-longevity`.
- Managed worktree: `C:/Users/Keptin/.codex/worktrees/tavernary-longevity/Tavernary`.
- Original checkout contains the pre-existing submission-manifest edit and
  untracked AGENTS.md, CLAUDE.md, and generated catalog; preserve them.
- Runtime: Node 24.16.0, npm 11.12.1. Committed dependency install: exit 0.
- Installed Next.js static-export and Vitest/Playwright guides read.
- Baseline dependency audit: 11 high and 1 critical findings. Triage in the
  dependency maintenance phase; an audit's suggested downgrade is not an
  authorized or verified runtime/framework transition.
- [Preflight observations](../superpowers/plans/2026-10-07-longevity-preflight.md)
  record existing deployment/browser behavior, separately from overhaul proof.

## Requirement evidence

| ID  | Required result                                       | Current evidence/status                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1  | Current main base; preserve original changes          | Isolated branch from the recorded main SHA; original status recorded; integration recheck pending |
| R2  | Recover every missed core handoff                     | Pending implementation and integration/canary proof                                               |
| R3  | Eligible Kits/owner flows; preserve manual decisions  | Pending                                                                                           |
| R4  | Cancellation and 72-hour outage recovery              | Pending                                                                                           |
| R5  | Exact head, identity, authority, tombstones, paths    | Existing protections are baseline; new adversarial evidence pending                               |
| R6  | Serialize and deduplicate writes/deployments          | Pending                                                                                           |
| R7  | Prevent ordinary deployment regression                | Pending                                                                                           |
| R8  | Recover when old hosted manifest is unavailable       | Pending                                                                                           |
| R9  | Confirm public revision, digests, browser behavior    | Existing baseline browser observations only; new manifest/confirmation pending                    |
| R10 | Retained verified bundles and safe rollback           | Pending                                                                                           |
| R11 | GitHub health checks and bounded incidents            | Pending                                                                                           |
| R12 | Trusted fields, factual fallback, deterministic scans | Existing scan fallback is baseline; overhaul proof pending                                        |
| R13 | Scheduled changed metadata, cache, global budgets     | Pending                                                                                           |
| R14 | Gated dependency completion                           | Pending; baseline audit requires triage                                                           |
| R15 | Verified supported-runtime policy                     | Pending                                                                                           |
| R16 | Safe bounded retention                                | Pending                                                                                           |
| R17 | Owner runbook                                         | Pending                                                                                           |
| R18 | Attached PRs, CI, review, merge, production proof     | Pending                                                                                           |

## Rulings and task outcomes

Ruling: Keep the approved existing ESM/Ajv modules with `.d.mts` contracts,
rather than introduce Zod/classes from a generic service-pattern skill. This
preserves current architecture; a wrong ruling would cost contract divergence.

Ruling: The explicit goal supplies PR/CI/merge authorization. Preserve all
required checks and obtain independent branch review; do not add repeated
integration permission gates. A wrong ruling would exceed approved scope.

### Phase 1 Task 1: shared failure and retry contracts

Seventeen behavioral regressions were each observed failing before their
implementation and passing afterward. They cover cancellation beyond 72 hours,
authority loss, deterministic validation, superseded input, prescribed delays,
provider/runner failures, configuration circuits, unknown failures, Retry-After,
jitter, sanitized diagnostics, and malformed clocks/counters.

Verification: focused tests 17/17; full unit suite 226 files / 2667 tests;
`npm run typecheck` and scoped ESLint exit 0. Existing baseline `npm run check`
and all seven browser/visual/Kit commands exit 0 on Windows. Linux-only browser
cases and required remote checks remain pending. These primitive results do not
prove end-to-end workflow recovery; controller integration is the next task.

Ruling: Configuration and exhausted-unknown circuits use a 24-hour probe;
transient jitter is positive, deterministic, capped at 10%, and never exceeds
the 24-hour interval. This avoids shared outage retry storms; the cost if wrong
is delayed detection of repaired credentials, so owner recovery commands must
provide an explicit wake/probe path.
