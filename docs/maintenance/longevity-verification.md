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

### Phase 1 Task 2: current-head recovery

The validation controller now classifies failed validation, publication, and
regeneration runs, records a sanitized due time, and resumes transient work
without permanently exhausting an allowance. Tests simulate a 72-hour outage,
missing terminal timestamps, unknown failures, malformed timing, changed PR
author/transaction at the final dispatch boundary, disabled automation, and a
merge completed before cancellation. Manual and modified transactions retain
their existing exclusion guards.

Verification: selected controller tests 71/71; full unit suite 226 files / 2680
tests; typecheck, scoped ESLint, formatting, and diff whitespace checks exit 0.
The broad missed-handoff canary and production evidence remain pending.

Ruling: Three unknown failures and success without generated output use a daily
incident probe instead of a permanent block. Terminal timestamps anchor stable
jitter; exact-run bot markers preserve timing when GitHub omits timestamps.
The cost if wrong is bounded probing of a defect until it is corrected.

Ruling: Pass the existing automatic-publication switch into the reconciliation
workflow and fail closed when it is absent in the CLI. Publisher retains its
final authoritative policy check. The cost if wrong is paused recovery when
configuration is absent, rather than mutation that bypasses policy.

### Phase 1 Task 3: generation and credential boundaries

Submission and owner CLI producers now preserve safe credential, timeout,
rate-limit and configuration codes. The consumer uses the same strict allowlist;
malformed artifacts, extra fields, unfamiliar codes and arbitrary error messages
cannot enter durable diagnostics. Existing Reddit retry state is preserved.
Owner preparation and validated replay both write the sanitized diagnostic.

Verification: generation, cross-stage recovery and existing publication-authority
coverage 106/106; full unit suite 227 files / 2690 tests; typecheck, scoped ESLint,
formatting and whitespace checks exit 0. The production controller adapter is
exercised with recorded API effects for repaired CI after a 72-hour outage,
active-Publisher deduplication, and actor/head changes after preparation.
The shared retry suite also exercises malformed rate-limit metadata.

Ruling: Keep output-invalid as an unknown generation defect, rather than evidence
that submitted content is invalid. Share one producer/consumer allowlist and
preserve the existing submission workflow wiring and declaration without redundant
edits. The cost if wrong is conservative unknown probes for unfamiliar failures.
Whole-inventory cancellation recovery and dependency-wide circuit suppression
remain Phase 2 work; token acquisition near publication remains Phase 3 work.

### Phase 2 Task 1: durable operation contracts

Stable operation keys use kind, immutable subject, normalized input digest and
policy version. Strict version-1 receipts reject unknown fields and versions,
unsafe identities, mismatched hashes, invalid clocks and worker handles,
unrecognized diagnostics, inconsistent failure kinds, and contradictory
completion evidence. Due selection is stable and bounded; stale duplicate events
cannot reopen active, completed or permanently rejected operations.

Verification: operation/receipt and shared recovery tests 26/26; typecheck,
scoped ESLint, formatting and whitespace checks exit 0. These contracts are not
yet wired into authoritative domain inventories or the scheduled controller.

Ruling: Limit a pass to twenty operations and one per subject, and share the
classifier's allowed reason/kind catalog with receipt validation. Finalized
receipts require a completion timestamp, a revision and no active worker.
The cost if wrong is reduced same-source throughput; publication and pruning
still require authoritative evidence rather than trusting a receipt alone.

### Phase 2 Task 2: project and owner inventories

Project and owner work is reconstructed from current issues, normalized input,
trusted PR transactions, exact-head validation, worker runs and merged revisions.
Missing admission, generation, validation, publication and deployment bookkeeping
remain discoverable without an event or receipt. Manual transactions, changed PR
heads or actors, closed unmerged issues and intentional correction states remain
protected. Receipts contribute current-input retry timing, never publication proof.

Verification: inventory and existing owner/publication coverage 86/86; typecheck,
scoped ESLint and formatting exit 0. New regressions cover 72-hour outages, missing
timestamps, changed inputs, untrusted workers, live regeneration and closed merged
issues. Inventory coverage includes 205 issues; API pagination is wired in Task 5.

Ruling: Bind terminal generation diagnostics to a validated current-input receipt;
retain stable timing when timestamps are absent. Unbound historical failures do
not reject edited input. Preserve intentional correction/decline states; merged
transactions remain eligible for deployment bookkeeping after issue closure.
The cost if wrong is conservative rediscovery until canonical evidence is loaded.

### Phase 2 Task 3: Kit and withdrawal inventories

Eligible Kit admission, triage, publication, deployment and cleanup are rebuilt
from manifests, numeric authors and canonical records. Withdrawals require the
confirmed manifest and matching canonical author. Tombstones and already-published
Kits recover deployment or cleanup without republishing. Manual review, invalid
composition, blocked authors and deleted sources do not enter publication.

Verification: Kit and project inventory plus existing reconciliation coverage
50/50; typecheck, scoped ESLint, formatting and whitespace checks exit 0. New
regressions cover cancellation through a 72-hour outage, edited input, normalized
text, untrusted workers, canonical-record proof and replayed cleanup.

Ruling: Reuse the existing Kit history classifier directly rather than changing
its legacy CLI behavior during inventory construction. Extract the already-tested
worker/receipt retry helper so Kit and project recovery cannot diverge. Attach the
loaded canonical checkout revision to Kit deployment work; receipts alone never
prove publication. The cost if wrong is conservative manual exceptions or delayed
cleanup until deployment proof is available; the controller must load that proof.

### Phase 2 Task 4: catalog, report and deployment inventories

Refresh work uses source identity and the last completed refresh rather than a
polling timestamp. Metadata and advisory work use current evidence and policy;
unchanged completed evidence is skipped. Missing advisory notices remain separate
from inference. Report imports use validated immutable index identities, exact
canonical digests and current synthesis policy, with stable quarantine probes.
Deployment discovery coalesces current-main requests and requires matching public
revision/catalog/target proof, retained-bundle integrity and essential smoke checks
before confirmation. The hosted target manifest does not select deployment heads.

Verification: nine inventory and existing policy/report suites 157/157; typecheck,
scoped ESLint, formatting and whitespace checks exit 0. Regressions cover missing
state, unavailable providers, 72-hour recovery, changed digests, unsafe report URLs,
source deletion/identity change, duplicate deployment requests and false confirmation.

Ruling: Use the current trusted main revision as the sole ordinary deployment
candidate. Canonical report projections must come from the loader's validated
stored index; worker association requires trusted main code, Publisher actor and
the exact operation key. Initial metadata inventory uses evidence/head identity;
Phase 4 adds normalized-content cache selection before model calls. The cost if
wrong is conservative rediscovery, rather than receipt-authorized publication;
public proof, cache validation and worker wiring remain integration obligations.

### Phase 2 Task 5: bounded controller and event wakes

The production loader paginates current issues, PRs and workflow runs, splits
capped history searches, and directly verifies every saved worker handle. It
rebuilds the real catalog and targets without generated-file writes. The
controller selects at most twenty operations, rechecks eligibility, records
dispatch intent before effects, and preserves active handles after interruption.
Unchanged observations produce no heartbeat commit; zero-limit and dry runs
produce no effects. A trusted-main worker routes current operations to existing
workers and the forthcoming shared writer. Successful workflow wakes supplement
the fifteen-minute schedule; failures cannot start an unavailable-dependency loop.

Verification: controller/GitHub/CLI/worker/digest/workflow regressions 36/36,
follow-up CLI-error and custody coverage 46/46; typecheck, scoped ESLint and
formatting exit 0. Tests cover missing webhooks, cancelled dispatch, receipt
failure after dispatch, live generic workers, cross-key results, truncated API
results, deliberate publication pause, invalid deployment proof and main lineage.
The complete unit suite passes: 239 files, 2,803 tests. The prior custody assertion
was updated to check the explicit owner-or-Publisher manual dispatch guard.

Ruling: Separate semantic catalog/target digests from generation timestamps, while
leaving the existing external target publication digest contract unchanged.
Confirmation requires complete matching proof and an ancestor of trusted main.
The cost if wrong is delayed confirmation; Phase 3 must retain full asset hashes
and reverify public proof before finalization.

Ruling: Include trusted Publisher dispatch in admission and preserve the owner
publication pause as an intentional wait. Paginate final worker lookups and
refuse GitHub result truncation. The cost if wrong is delayed recovery rather
than duplicate dispatch or unauthorized publication.

Ruling: Commit controller/worker wiring as an intermediate foundation; the branch
is not ready for integration until Phase 3 moves all canonical receipt/data writes
into the shared writer, consumes trusted safe worker diagnostics, and supplies its
publication/confirmation/finalization modes. Phase 4 must replace the placeholder
model-ticket gate with serialized budget reservations and validated cache hits.
The cost if wrong is incomplete optional worker execution; no PR or production
completion is claimed at this boundary. Keep legacy recovery active until its
shared-writer replacement has tested coverage.
