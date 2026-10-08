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

### Phase 3 Task 1: validated canonical write planning

Strict prepared-result envelopes bind the current operation, immutable source,
author, policy/input digest, trusted in-repository Publisher producer/run/main
revision, allowlisted JSON paths, byte sizes and content/base hashes. Unsafe
paths, links, unknown fields, invalid domain data, changed authority and stale
file bases fail before writes. Independent snapshots coalesce into one commit;
replays produce one action, conflicting claimants regenerate together, and a
canonical published operation recovers bookkeeping without republishing.

Project candidates retain the existing planner's authority, manual approval,
exact-head and base-drift checks. The envelope additionally binds the transaction
actor/source/paths and every prepared file hash to the validated PR head. A
permanently rejected current input remains rejected on artifact replay.

Verification: prepared-result, write-lane and existing project-planner coverage
69/69; typecheck, scoped ESLint, formatting and whitespace checks exit 0. Watched
regressions caught unrelated base revisions, incomplete conflict propagation,
project-envelope substitution, excessive candidate counts, permanent replay and
cross-source operation binding.

Ruling: Represent prepared data as a bounded strict JSON envelope; the writer
supplies domain validators and current base hashes, and executes no artifact
code. Accept only configured Publisher producers on main; legacy/manual entry
points must route preparation through that trusted dispatch. The cost if wrong
is conservative regeneration or rejected producer output. Archive validation
and actual workflow custody remain later publication tasks.

Ruling: Require the existing project planner plus transaction/validated-file
binding, rather than admitting project records through generic snapshot commits.
The cost if wrong is an extra data read or regeneration; exact-head/manual/owner
protections remain mandatory. Bookkeeping satisfaction relies on the caller's
authoritative canonical operation stage and must be rechecked in the publisher.

## Phase 3 Task 2 checkpoint — in progress

The serialized writer now consumes validated data artifacts, refreshes trusted
main at its write boundaries, performs aggregate catalog validation, rebuilds
both v7 and v8 assets, and applies parent-bound Git data commits with
`force=false`. Co-committed publication evidence binds the operation and target
file hashes; canonical path history supplies the publication revision. Receipt
outages recover bookkeeping without another data commit.

Reconciled repository refreshes now carry their immutable operation key into a
read-only preparation job pinned to `github.sha`, capped at forty-five minutes.
The job retains one `result.json` artifact for ninety days. Completed-run wakes
re-fetch producer metadata before dispatching the shared writer. Scheduled
reconciliation can recover a missed wake, sharing its twenty-operation quota
with ordinary due work. The writer verifies the authenticated archive digest,
ZIP headers, regular-file/path bounds, CRC, bounded decompression, producer
custody, current domain authority and base file hashes.

The real inventory adapter comparison caught omitted install evidence and Kit
support in semantic catalog digests. Both inputs and Codeberg snapshots are now
included. Further regressions cover immutable capture, forbidden acquisition
paths, concurrent main changes, cross-reference validation, post-publication
cancellation, invalid Publisher identity and artifact-chosen advisory notice
issues.

Verification: 257 unit files / 2,951 tests pass; full ESLint and type checking
exit 0. The initial full runs caught stale workflow inventory assertions; their
replacement retains App-token and actor custody coverage for the new writer
and completion-dispatch path. The live read-only integrity probe also matched
GitHub artifact 11533282408 / run 37739473002 to its authenticated SHA256
`55c8cc74cf48812a7d5df3a2d5638d37b86e93824b428ad73baaa1fd6c320054`.

Ruling: Co-commit immutable publication evidence with canonical data and derive
its revision from path history. Receipts remain retry and bookkeeping state.
The cost if wrong is conservative recovery rejection, with actual target hashes
still required before a replay can satisfy publication.

Ruling: Use explicit-parent, non-forced Git reference updates for prepared data.
A concurrent main advance requires regeneration. The cost if wrong is an
unattached Git object or an extra preparation run.

Ruling: Accept trusted completed-run notifications as wake hints, and reconstruct
missed notifications on the scheduled shared writer. Artifact inspection and
ordinary reconciliation share the operation quota. The cost if wrong is an extra
read-only probe; archive integrity and current authority still gate every write.

Task 2 is unfinished. Owner refresh and Kit support paths remain until equivalent
shared-writer coverage exists. Kit/withdrawal, report, advisory and enrichment
preparation, bounded rollout checkpoints, exact-head project merge routing,
final-boundary emergency controls, safe diagnostic consumption and removal of
old direct deployment/finalization paths remain required before integration.
Publication history lookup, canonical blob hashing across checkout line endings
and high-volume GitHub inventory costs also require hardening and canary coverage.

### Kit preparation and canonical proof hardening (Task 2 still in progress)

Reconciled Kit and withdrawal work now carries its immutable operation key into
separate, pinned, read-only preparation jobs. The existing review entrypoints
remain until replacement correction and verified-deployment lifecycle behavior
is fully covered. The new request adapter preserves malformed-withdrawal
feedback, paginates comments, accepts only the numeric automation bot's owned
correction comments, and checks for late request edits before mutation.

Kit recovery requires the current create manifest to match the published record.
Identical staff edits recognize canonical data only with current trusted editor
authority. Canonical base/publication hashes now use bounded Git blob reads, so
checkout line endings cannot invalidate proof. One streaming history read
replaces per-publication Git subprocesses. Large Contents API files are verified
through their pinned Git blob identity and actual content hash.

Evidence: the full unit suite passed 264 files / 2,978 tests, and full lint and
type checking passed. The subsequent large-file verification change passed its
8-test regression suite after watched RED/GREEN. Workflow contract tests retain
protected Publisher App and numeric actor checks. All remaining Task 2
migrations, final complete verification, independent review, CI, merge and
production proof remain outstanding.

### Project writer integration (Task 2 still in progress)

The shared writer now handles selected-PR validation recovery and exact-head
project merges through the common publisher. Current numeric Publisher custody,
transaction identity, source ownership/staff authority, issue decisions,
generated paths and authenticated exact-head CI are re-fetched before merging.
The emergency switch is read again at the final write boundary. Status comments
retain the existing default automation bot's custody; App authority handles
workflow dispatches and merges. Existing legacy entrypoints/lifecycle paths
remain until equivalent replacement coverage is complete.

Narrowly named operation/publication/deployment bookkeeping files are accepted as
unrelated base drift; authority registry, vocabulary, policy, code and generated
file changes still require revalidation or regeneration. Validation recovery
can select one PR without scanning unrelated requests.

Evidence: full unit suite 266 files / 2,989 tests pass; full lint and type checking
pass. Production-adapter tests confirm that disabling the emergency switch at
the final boundary prevents every write. Original-commit publication evidence,
remaining producers, all final deployment/maintenance phases and final review,
CI, merge and production verification are still required.

### Original publication evidence (Task 2 still in progress)

Canonical recovery now verifies the original commit containing both the
publication record and its prepared data. Later authorized data updates do not
erase this evidence. Detached record edits, executable data, substituted Git
objects and unchanged prepared bytes fail verification. One bounded streaming
Git history read checks the native object identity of each co-committed file.
Deployment confirmation remains a separate required proof before finalization.

Ruling: require each file's native Git object identity in the unreleased
publication-record format — this binds verified prepared bytes to their original
commit without one historical subprocess per payload. The cost if wrong is
recoverable waiting, never permission to apply an operation twice.

Evidence: the complete unit suite passed 266 files / 2,993 tests. Full lint and
type checking passed. Four real-Git regression cases cover line endings,
subsequent updates, detached records, executable data and substituted objects.
Task 2 migrations, all later phases, independent review, CI, merge and actual
production verification remain outstanding.
