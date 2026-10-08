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

Current delivery: [draft PR #818](https://github.com/MentallyQuill/Tavernary/pull/818)
is attached. Both required `verify` and `visual` checks passed on head
`3531e752fee4d3ba4d5e5b0e4ae1cf0585038511`, including the report writer,
focused content deployment checks and the refresh migration. The next batch
migrates identity maintenance and Publisher probes; previous CI does not
validate that batch.

Remaining implementation: manual enrichment/checkpoints,
fork-dependent recovery, complete provider-budget coverage, and Phase 5
dependency/runtime/health/retention/drill/runbook work. End-to-end canary,
independent review, final CI, merge and production verification remain required.

| ID  | Required result                                       | Current evidence/status                                                                                                 |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | Current main base; preserve original changes          | Isolated branch from the recorded main SHA; original status recorded; integration recheck pending                       |
| R2  | Recover every missed core handoff                     | Pending implementation and integration/canary proof                                                                     |
| R3  | Eligible Kits/owner flows; preserve manual decisions  | Pending                                                                                                                 |
| R4  | Cancellation and 72-hour outage recovery              | Pending                                                                                                                 |
| R5  | Exact head, identity, authority, tombstones, paths    | Existing protections are baseline; new adversarial evidence pending                                                     |
| R6  | Serialize and deduplicate writes/deployments          | Pending                                                                                                                 |
| R7  | Prevent ordinary deployment regression                | Planner, fresh serialized Git ancestry guard and native queued-build regression tests; live canary pending              |
| R8  | Recover when old hosted manifest is unavailable       | All failed old-manifest reads are advisory; strict new-export verification; production recovery pending                 |
| R9  | Confirm public revision, digests, browser behavior    | Fixed-origin HTTP integrity, Chromium/WebKit smoke and protected confirmation writer tested; live proof pending         |
| R10 | Retained verified bundles and safe rollback           | Native full-export archives, immutable release retention and owner-only current-data restore tested; live setup pending |
| R11 | GitHub health checks and bounded incidents            | Pending                                                                                                                 |
| R12 | Trusted fields, factual fallback, deterministic scans | Existing scan fallback is baseline; overhaul proof pending                                                              |
| R13 | Scheduled changed metadata, cache, global budgets     | Pending                                                                                                                 |
| R14 | Gated dependency completion                           | Pending; baseline audit requires triage                                                                                 |
| R15 | Verified supported-runtime policy                     | Pending                                                                                                                 |
| R16 | Safe bounded retention                                | Pending                                                                                                                 |
| R17 | Owner runbook                                         | Pending                                                                                                                 |
| R18 | Attached PRs, CI, review, merge, production proof     | Draft PR #818 attached; verify/visual passed 3531e752f; next head, independent review, merge and production pending     |

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

### Coalesced publication recovery

Ruling: only the current global deployment operation requests Pages; domain
publication operations await that confirmed export. Otherwise twenty older
published operations can occupy the quota and repeatedly build stale revisions.
Authenticated active Pages runs coalesce the requested revision; foreign actors
and forks cannot suppress recovery. Confirmed descendant exports cover earlier
canonical publications through bounded batched Git ancestry reads.

Ruling: private metadata-only commits finish without a public deployment, while
private advisory commits remain eligible for notice finalization. Confirmation
failures retain their published revision and durable backoff. Equal receipt
state returns before rebuilding its timestamps, preventing terminal heartbeats.

Evidence: all 299 unit files / 3,221 tests passed; type checking, focused lint,
formatting and whitespace checks passed. New regression tests first failed for
duplicate Pages dispatch, starvation, private-only publication, active-run
custody, confirmation backoff and terminal timestamps, then passed. Publication
Task 2 remains in progress: native finalization, legacy writer migration and
canonical Kit history still require completion. Same-revision build identity
races and maintenance quota recovery remain integration obligations.

### Native publication finalization

The shared writer now implements finalization and advisory notice delivery.
Fresh canonical/public proof gates terminal receipts. Kit and project/owner
issue projections retry their unfinished effects, preserve human labels, ignore
foreign bot markers and refuse edited or declined requests. Completed receipts
only suppress work while the authoritative publication remains covered.
Private advisory delivery binds numeric bot custody to its immutable operation;
a lost canonical pointer commit recovers the created issue without duplication.

Ruling: change workflow-owned labels individually rather than replacing the
issue's entire label list. Ruling: remove a stale maintainer-review label after
the unchanged transaction has actually merged; explicit declines and requests
for information remain protected. Ruling: render the persisted advisory category
with neutral text, because the canonical review contract retains no model prose.
The costs are extra bounded reads and conservative deferral on custody conflicts.

Evidence: all 301 unit files / 3,236 tests passed; types and focused lint passed.
Watched regressions cover terminal replay, saved notice delays, lost projection
and pointer writes, numeric custody, stale review labels and changed input.
Task 2 remains in progress: legacy write/lifecycle workflows, Kit path history,
fork-dependent recovery, manual rollout checkpoints and report incidents still
require completion. This checkpoint is not PR, merge or production completion.

### Exact revision manifest and monotonic Pages deployment

The complete export contains `revision.json`, binding the exact source SHA, build
run, supported public schemas, semantic catalog/target identities and every
other exported regular file's SHA-256 and size. Native verification rejects
extra/missing/modified assets, unsupported schema versions and substituted
source/build identity. Links, unsafe paths and resource-limit violations fail
closed. The revision manifest excludes its own hash to avoid a circular digest;
its schema, build identity and all other asset digests are independently checked.

Pages retains this run's integrity metadata for ninety days and downloads it by
exact workflow run and source name. Immediately before the serialized Pages
action, the controller fetches main and rechecks trusted main/deployment ancestry.
Older queued builds are superseded, verified duplicates coalesce, unknown
ancestry is rejected, and ordinary publication cannot roll back a descendant.
Missing, invalid, unavailable and timed-out previous hosted target manifests are
advisory. The new export remains strictly validated.

Ruling: recover the latest publishable ancestor after internal bookkeeping
commits — budget/cache/confirmation state does not require a new website — cost
if wrong: unknown paths conservatively trigger a deployment rather than hiding
public changes. Read-only cache/advisory publication retains cross-reference
validation but does not manufacture timestamp-only generated catalog writes.

Ruling: inventory uses the canonical refresh timestamp used by the production
catalog builder — commit time changed time-derived activity/trending values and
made confirmation digests disagree — cost if wrong: time-derived display changes
wait for the next canonical refresh, preserving existing production behavior.

Evidence: watched RED/GREEN regressions cover native Git bookkeeping/queued
builds, incomplete confirmation proof, cache-only public-write suppression and
the real production build's semantic digest. All 279 unit files / 3,114 tests
passed; full lint and type checking passed. The production export was rebuilt
with 508 projects and 23 Kits, then verified byte for byte against the new
revision manifest. Public confirmation, retained complete
bundles, the remaining writer migration, later phases, review, CI, merge and
actual production proof remain required.

### Public deployment confirmation

The production verifier polls the fixed Tavernary HTTPS origin for the exact
revision and build. It verifies catalog and target bytes, semantic digests,
supported schemas, essential route bytes and loaded browser assets. Chromium
and WebKit check hydration, search, creator source links, Kits and submission/menu
routes. Requests are restricted to same-origin GET/HEAD; no issue is submitted
and no third-party source is opened. A final manifest read detects a deployment
changing during the probe. A wrong revision remains pending; corrupt data or
failed essential browser behavior cannot produce confirmation.

The protected writer authenticates completed Pages run metadata, repository and
head repository numeric identities, dispatch actor, exact workflow/source,
Git ancestry and the one-file revision ZIP digest before probing public output.
It refreshes main again before committing private confirmation proof through the
canonical lane. Existing proof coalesces replays without heartbeat writes.
Neither a successful Pages action nor an uploaded confirmation result suffices
for a durable success claim.

Ruling: wake confirmation from the whole Pages workflow's completed event,
including failed final checks — dispatching inside its last job races a still
active run, and an unrelated failure must not erase verified public progress.
The cost is another bounded public probe in the protected writer. Scheduled
reconciliation remains the recovery mechanism when this handoff is missed.

Ruling: bound the entire public probe to four minutes, including a stuck browser,
with twenty-second asset requests — nested bounds cannot leave the writer running
indefinitely. The cost is deferred confirmation during slow propagation.
Ruling: keep fixed-origin selection in an import-safe module — the actual Node
CLI exposed a top-level-await import cycle that unit calls did not exercise.
The cost is one small shared module, with a real child-process regression.
Expired or absent revision artifacts defer recovery rather than permanently
freeze it; substituted provenance or archive contents still fail closed.

Evidence: the handoff and native-writer regressions were observed failing before
wiring, then all seven selected suites passed 119 tests. The actual local static
export passed five deployment-browser tests with one intentional duplicate-CLI
skip. The real Node CLI completed HTTP and both browser probes in 12.6 seconds;
an aborted hydration script was rejected by each browser. Full type checking and
lint passed. The full suite passed 283 files / 3,150 tests. Retained complete bundles, dependent operation finalization, all
remaining phases and actual merged production confirmation remain required.

### Retained-bundle foundation (publication Task 5 in progress)

Complete site bundles use a versioned, gzip-compressed frame with a bounded JSON
header and regular file bytes. Native verification rejects unsupported formats,
unknown paths, traversal, links, duplicates, missing/extra files, corrupt bytes,
malformed schemas and inconsistent semantic digests before extraction. Restore
creates a new directory and rejects parent links. Compressed exports are limited
to 128 MiB and uncompressed assets to 256 MiB, with existing per-file and count
bounds. The actual current export fits these limits.

Ruling: use native gzip with a small explicit frame rather than a general archive
extractor — recovery accepts only regular allowlisted files and requires no new
runtime package. The cost is requiring the trusted bundle tool for recovery;
the owner runbook must document the format. The shared V8 schema factory keeps
the browser parser and native recovery validator on the same full schema;
V7 remains supported and target validation uses the tracked V3 schema.

The GitHub adapter authenticates completed Pages runs and bounded one-file ZIPs,
then uploads a verified export and confirmation proof to a draft release.
Interrupted uploads reuse the same draft without replacing verified assets.
Publication must yield an immutable Publisher-authored release whose tag matches
the exact source commit. Read-only restore verifies both release asset hashes,
public confirmation, source ancestry and the complete enclosed export.
Retention preserves the latest three bundles and one per calendar month across
twelve months, plus protected restore references. Only verified automation
releases can be pruned; changing download counters do not alter their identity.

Ruling: require GitHub release immutability and fresh source-bound metadata rather
than overwriteable release assets — a durable artifact must resist replacement.
The cost is one owner-authorized repository setup step before the production
canary. Read-only GitHub inspection on 2026-10-08 found immutability disabled and
no existing releases. Setup is still required; no production mutation occurred.
[GitHub documents](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
that complete immutable releases can be deleted while their surviving assets and
tags cannot be edited.

Evidence: the real native CLI created a bundle from the complete export, restored
it into a fresh tree and passed five Chromium/WebKit deployment tests with one
intentional duplicate-CLI skip. The restored Node confirmation CLI completed in
12.2 seconds. Lost upload, replay, current-data/owner-removal conflicts, unsafe
archives, full schema checks and changing GitHub counters have focused tests.
The complete repository check passed 288 unit files / 3,180 tests, formatting,
lint, palette, catalog/report validation, type checking, build and export checks.
Task 5 remains in progress: native current-data restore, workflow wiring, lost
retention-handoff recovery, production configuration and subsequent phases are
still required.

### Durable model usage checkpoint

Scheduled metadata, advisory and optional report preparation now reuse one
verified model guard per producer. Successful responses carry only ticket IDs,
request counts and conservative requested token bounds in the existing immutable
result envelope. The native publication planner preserves that evidence, and the
catalog builder checks the current complete producer/ticket binding before
settling it in the same canonical commit. Reserved daily/monthly charges are
never refunded for failures, interruption or unused repair allowance. Replayed
settlement is idempotent; a changed producer or reservation is rejected.

Evidence: missing usage/settlement and repeated native guard loading were watched
failing, then passing. A real metadata request path returned two HTTP 503s and
one successful response: only the success appears in recovery evidence, while
all three requests remain reserved. The test carries the actual prepared result
through validation, planning and catalog rebuilding into the durable ledger.
The production CLI saves that safe evidence without prompts or raw payloads.
Nine focused suites passed 153 checks; types and scoped lint passed. This checkpoint covers
the migrated producers; production manual enrichment and all intake/generation
producers still need their allowance integration before all-provider completion.

### Native retained-site restore and active public proof

Pages builds now retain the complete verified archive for ninety days. Owner-only
restores default to a dry run, authenticate an immutable Publisher release and
compare the actual current canonical catalog, target digests and owner removals.
The final live step shares the canonical writer lock and holds it through Pages
deployment and fixed-origin public verification. Trusted current code and
dependencies perform recovery; archived scripts are never executed.

Completed restore provenance binds the actual owner workflow run, attempt,
repository identities, release, source, build, hashes and checked public baseline
in a bounded immutable Actions artifact. The shared writer authenticates that
artifact and the retained release, then performs public asset and browser checks
before recording the active rollback. Ordinary confirmation atomically records
both historical proof and the active site. Historical success cannot masquerade
as the site currently served after a rollback.

Ruling: respect an explicit owner rollback until its checked public baseline or
canonical semantic data changes — ordinary reconciliation otherwise immediately
undoes the authorized recovery. The cost is a deliberately older presentation;
all current data and removal protections still apply. A new publishable change
resumes forward deployment, and a normal verified deployment clears the override.

Bundle recovery reuses a validated draft asset even after its original Actions
artifact expires. Scheduled reconciliation reconstructs missing retention wakes
from active public proof and verifies the small immutable proof rather than
downloading the entire export. Pending owner restores and the active rollback
protect their releases; pruning refreshes those references before deletion.
Portable extraction rejects filename case/normalization aliases, reserved Windows
names, unsafe characters and file/directory collisions before creating files.

Evidence: watched regression failures covered rollback reconciliation, historical
proof substitution, restore actor/fork/attempt/hash/title substitution, changed
main, incorrect public assets, expired-artifact draft recovery and portable paths.
The production restore adapter authenticates both original archives before its
public probe. Replays produce no canonical heartbeat writes. The full repository
check passed 297 unit files / 3,213 tests, formatting, lint, palette, data validation,
types, production build and export verification.

The rebuilt export also passed native create/restore followed by five actual
Chromium/WebKit deployment tests (one duplicate-CLI skip). The Node HTTP and
both-browser confirmation command completed in 12.8 seconds. The local verified
archive digest was
`sha256:817e54d8f9242b9f9f1a3b29bdf107e29d316f0bec52814cc62e9c7f32adf048`.
This is fixture evidence; no production site or GitHub setting was changed.

Publication Task 5 remains in progress. The maintenance/integration phases must
route retention and dropped restore-confirmation recovery through shared quotas,
durable backoff and incident handling, enable repository release immutability,
and exercise the live recovery canary. All remaining publication and metadata
migrations, maintenance, independent review, PR/CI/merge and production proof
remain required for the approved goal.

### Budgeted metadata and advisory producer integration (Task 4 in progress)

The reconciled metadata/advisory workflows now expose authenticated, pinned,
read-only preparation jobs. Both accept writer-bound allowance, retain immutable
results and sanitized diagnostics for ninety days, and cannot write main. The
existing manual rollout and advisory transaction lifecycle jobs remain guarded
separately until their equivalent shared-writer migration is complete. Advisory
dispatch retains all existing required project/transaction/revision inputs.

Metadata acquisition verifies the current numeric repository ID before reading
the pinned README, bounds JSON responses and timeouts, validates snapshot/schema
readiness and normalizes README/description evidence. Cache hits are checked
before reservation and update provenance without a model request. The writer
re-observes content and validates the project/cache together; substituted content
fingerprints, output digests, identities or missing sidecars cannot publish.
Automatic tag updates preserve manual summary policy and exact text.

Ruling: bind description and immutable repository ID into metadata operation
identity — description-only or identity changes must not reuse old intent — the
cost is one new refresh after such an authoritative change. Ruling: preserve
required legacy advisory inputs and supply verified values from the writer —
read-only preparation must not weaken manual review's dispatch contract.
Ruling: let authenticated failure bookkeeping replace an intent-only dispatch
delay — the delay prevents duplicate dispatch, not preservation of actual failure
classification — a recorded failure still blocks replay heartbeats.

Ruling: enlarge the conservative primary envelope to 180,000 tokens across three
attempts, plus one 15,000-token repair envelope — the measured real source-backed
prompt exceeded the original 30,000-token total before its first request. Unknown
or unused allowance stays charged. The cost is potentially one optional model
operation per UTC day. Actual production throughput will remain bounded by this
documented policy; deterministic security publication does not depend on it.

Evidence: new regressions were observed failing, then passing for cross-file
cache validation, cache-before-reservation, workflow endpoints, required advisory
dispatch inputs, durable budget refusal, intent/failure delay distinction,
description-only refresh and immutable identity binding. Native provider tests
exercise three real serialized request bodies inside the ticket envelope with
no network access. All 276 unit files / 3,090 tests passed, with full lint and
type checking passing. Overall producer/model integration, all legacy main
publisher migrations, deployment/maintenance/integration phases, independent
review, CI, merge and public production proof remain unfinished.

### Shared batches and durable handoff failures (Task 2 still in progress)

The production runtime now sends compatible prepared operations through one
validated atomic commit, retaining a separate co-committed record per operation.
Every operation's authority is refreshed at the write boundary. Missing artifacts
are isolated so a healthy handoff can publish. Failures persist only sanitized
classification and bounded retry state; repeated unknown failures move to daily
probes after three attempts. Replayed completions cannot reset a saved delay or
create heartbeat commits. Superseded artifacts yield to ordinary regeneration.

Authenticated completed preparation releases dispatch waiting for artifact
inspection. It does not establish publication. Saved artifact failures still
apply, and foreign producers cannot release a stalled dispatch.

Ruling: share one canonical build/commit for compatible data — this reduces
repeated inventory reads and generated-catalog writes without broadening any
operation's path or authority. The cost if wrong is a whole-batch refusal at the
last authority check, followed by normal reconciliation.

Evidence: the complete unit suite passed 268 files / 3,008 tests; full lint and
type checking passed. A subsequent test correction directly verifies that a
foreign source path is rejected while the authorized source can publish. The
remaining producer/lifecycle migrations and all later phases remain required.

### Authenticated diagnostics and bounded inventory reads (Task 2 in progress)

Failed preparation completions now wake reconciliation. The writer authenticates
the run, repository, numeric actor, operation and artifact origin, verifies the
archive digest in memory, and accepts only a bounded diagnostic with enumerated
failure kind/reason. Raw provider text and extra fields are rejected. Successful
preparation remains mandatory for data publication. Diagnostic bookkeeping
outages are surfaced rather than swallowed. Repeated failures retain their
attempt count across subsequent preparations and honor saved daily probes.

Workflow-run inventory checks the first page before pagination. Over-cap recent
searches split into bounded windows; over-cap active/final-worker searches refuse
without spending pagination requests. A read-only live GitHub CLI probe confirmed
the first-page response shape. Complete bounded inventories and old saved worker
handle verification remain required.

Ruling: recover failure reasons only from authenticated, schema-limited diagnostic
artifacts — diagnostics may adjust retry bookkeeping but cannot authorize a data
write. The cost if wrong is an unknown-failure retry or daily incident, never
publication. Ruling: probe result caps before pagination — an overloaded search
must split or fail closed, avoiding discarded page reads.

Evidence: the full unit suite passed 268 files / 3,019 tests; full lint and type
checking passed. Producer/lifecycle migrations, all remaining phases, independent
review, CI, merge and actual production proof are still outstanding.

### Read-only report preparation (Task 2 still in progress)

Authenticated report operations acquire one immutable report and prepare the
summary and import state without writing canonical files. The writer validates
the actual hashed scan, current repository identity, target, policy and schema;
it rejects softened danger grades, substituted targets and unrelated quarantine
changes. Missing verified model budgets produce the deterministic security
assessment, preserving security publication without optional model calls.

Ruling: serialize prepared reports sharing the global summary path — publish the
oldest due report and let later reports reprepare against its result. The cost
is slower backlog processing; rejecting all conflicting reports would prevent
progress. Ruling: preserve the existing report workflow's lifecycle jobs while
adding read-only preparation — equivalent incident, deployment and finalization
coverage is required before removing the legacy path.

Evidence: the full unit suite passed 269 files / 3,026 tests. Full lint and type
checking passed. Real importer tests verify selected-digest acquisition and
byte-for-byte preservation of local canonical files. A real immediate-danger
scan verifies deterministic grading and writer rejection of a downgraded result.
Task 2, subsequent phases, independent review, CI, merge and public production
verification remain outstanding.

### Stable catalog retry identity

Ruling: keep admitted catalog operations' expected SHA unset — their source input
identity binds retry bookkeeping, and prepared envelopes independently bind the
canonical base SHA. Binding admission to the moving main SHA discarded delays
when a receipt commit advanced main. Published, project, report-target and
deployment operations retain their required exact revision checks. The cost if
wrong is a retained delay for unchanged source input, never stale publication.

Three new regression cases first failed and now pass across repeated main
bookkeeping changes. Four focused suites passed 36 tests; type checking and
focused lint passed. The publication migration remains in progress.

### Reserved model allowance foundation (Phase 4 Task 2 in progress)

The serialized writer now atomically reserves primary, retry and repair
allowance before dispatch, then binds tickets to one authenticated run at the
reserved source revision. Read-only producers load current writer-owned state;
reruns, foreign actors, missing binding and expired tickets cannot call a model.
Primary and JSON-repair HTTP requests each consume a guarded local envelope.
Configuration or binding failures preserve spent allowance and safe diagnostics.

Ruling: do not refund requested daily tokens or unknown outcomes — requested
allowance remains the safety ceiling even when actual response usage is lower.
The cost is conservative throughput. Ruling: expire tickets at UTC midnight as
well as forty-five minutes — unused prior-day tickets cannot double a new day's
limit. Ruling: a lost dispatch/binding keeps its reservation spent and unusable
until normal recovery reserves new allowance — the cost is delayed optional work.

Evidence: the complete unit suite passed 272 files / 3,050 tests. Full lint and
type checking passed. New tests cover last-allowance competition, replay, repairs,
token and USD ceilings, rollover, malformed usage, backwards clocks, CAS races,
authentic producer binding, active-producer duplicate prevention and zero HTTP
requests without allowance. A read-only GitHub CLI query accepted the exact-SHA
workflow-run filter. Remaining producer endpoints, normalized metadata cache,
manual rollout preservation and all later phases remain required. Neither this
task nor the publication migration is complete.

### Normalized metadata selection and cache identity

Metadata selection normalizes bounded README/description content and reuses
validated cache entries across unrelated repository commits. Cache provenance
binds the immutable repository, project traits, policy, vocabulary, independent
automatic fields and actual canonical output digest. Current inventory includes
the vocabulary read from its trusted checkout; malformed or substituted cache
entries cannot suppress required work. Missing source evidence remains pending.

Ruling: cap a scheduled selection at ten records as well as ten sources — one
repository shared by many records must not create unbounded model work. The cost
is slower processing for such a repository. Existing manual fields remain
independently excluded.

Evidence: all 273 unit files / 3,061 tests passed; full lint and type checking
passed. The task's three named suites passed 22 tests. Producer acquisition,
writer validation of newly emitted cache sidecars and overall scheduled model
integration remain subsequent deliverables; the whole overhaul is unfinished.

### Writer process freshness

Ruling: defer publication when fetched main changes the writer's code, workflows,
dependencies, schemas, vocabulary or moderation policy — a running process must
not apply modules loaded before an authority/policy update. Data-only changes can
still be synchronized and freshly validated. The cost is one reconciliation
delay after a trusted code change. The regression first failed and now passes;
four writer/publication suites passed 22 tests, with type checking and focused
lint passing. The publication migration remains unfinished.

### Provider outages and bounded immediate retries

Automatic intake can retain a recent verified repository description when the
provider or its allowance is unavailable. The resulting record remains
provisional, with empty automatic tags; unsafe, absent or stale facts remain
pending. Manual field policy and source identity requirements remain enforced.
Sanitized warnings contain no provider response text. The existing provisional
and stale UI labels are tested against an actual generated factual record.

Ruling: share three immediate primary attempts across transport and validation
retry layers — nested loops otherwise multiplied requests beyond the approved
limit. Older four/five-attempt test expectations were updated to the specified
three-attempt behavior. The cost is earlier deferral to durable reconciliation.
Primary and JSON repair requests already reject missing required budget context
before HTTP; the environment adapter now accepts that mandatory policy flag.

Evidence: the nested retry regression first failed with five calls, then passed
with three. All 273 unit files / 3,071 tests passed, with full lint and type
checking passing. Actual intake CLI tests verify zero model HTTP requests when
required allowance is absent. Producer workflow wiring remains Phase 4 Task 4;
the publication migration and later phases, review, CI, merge and actual public
production verification remain outstanding.

### Kit writer migration

Kit creation/edit and withdrawal entrypoints now revalidate current admission,
authority and correction state, then dispatch immutable read-only preparation.
They mint only a fresh actions token after dependency installation and validation;
canonical publication and confirmed-deployment finalization use the shared writer.

Ruling: derive legacy Kit revisions from each canonical Kit file's Git history —
later receipt commits cannot change publication identity. Missing history fails
closed. Ruling: omit only the current authenticated request run before rebuilding
inventory — preserve peer producer runs and duplicate prevention.

Evidence: the two canonical-history regressions and the self-blocking request
regression failed before their fixes, then passed. The migrated workflow/history
checks passed 87 tests and request/lifecycle/native inventory checks passed 24.
Type checking, focused lint and whitespace checks passed. Existing withdrawal
feedback and Kit community support behavior remain covered by native tests.
Other writer migrations, budget coverage, maintenance, independent review,
PR/CI/merge and production verification remain required.

### Draft integration preparation

Current production main b7762519ed7ca01cbe148ca630d025895021ce32 was merged
without conflicts, preserving its 21 newer automated data commits. Full
`npm run check` passed on integration head
82344b6c96a5b9339088942f4c01079993ad3c68: 301 unit files / 3,234 tests,
formatting, lint, palette/catalog/report validation, types, build and export.

The first full run reproduced a native full-dataset inventory timeout at the
five-second Vitest default; every other test passed. The focused inventory/history
checks passed, and the full gate passed after assigning only that integration
test a bounded twenty-second deadline. All behavioral assertions and global
timeouts remain unchanged.

A draft PR is being submitted for real CI feedback. Remaining implementation,
independent whole-branch review, the current browser/visual matrix, CI resolution,
merge and actual production verification are still required. This is not the
completion of Task 2 or the overall goal.

### Advisory writer migration

The legacy advisory schedule and transaction entrypoint now select up to ten
eligible current operations and request shared-writer reservations or recovered
notices. They preserve exact merged-SHA/ancestry checks and saved eligibility
and worker delays. Only pinned read-only preparation receives model credentials;
main writes and advisory notice persistence use the existing shared writer.
The exhausted eight-attempt legacy scheduled retry loop is removed.

Evidence: new advisory request/workflow regressions first failed, then passed.
Native scheduled and manual CLI checks, budget adapters, writer and lifecycle
checks passed 39 tests; the updated workflow contracts passed 72 tests. Types,
focused lint and whitespace checks passed. Ruling: scheduled entrypoints select
at most ten current operations while the writer retains global reservation
and freshness authority; late input changes remain superseded by the writer.
The other legacy writer migrations and remaining approved phases are unfinished.

### Focused content deployments

Ruling: classify the complete Git diff from the active confirmed ordinary
deployment, rather than only the latest commit — a queued Kit update must not
hide an earlier implementation change. Missing/invalid proof, rollback state,
unknown paths or unsupported file modes default to the full gate. Cost: one full
build until an ordinary deployment is confirmed, and conservative extra checks.

Kit/catalog data updates now use the existing focused content validation, unit
checks, build and export verification. Security report validation is included.
Code, dependencies, schema, configuration and workflow changes retain the full
gate. Exact artifact binding, serialized deployment guard and public revision,
asset and Chromium/WebKit confirmation remain mandatory.

Evidence: the new classification/workflow regressions first failed, then the
native Git, classification and workflow checks passed 113 tests. A marker with
symlink mode is rejected. Actual `npm run check:content` passed all validation,
116 focused tests (8.36 seconds), production type checking/build and export
verification. Its first run caught a missing environment field in the new test
fixture; the corrected fixture passed the build. Other approved work,
independent review, CI, merge and production remain required.

### Publication/build clock consistency

The complete advisory unit suite passed 302 files / 3,239 tests. A subsequent
regression reproduced different catalog generation clocks after a seventy-two-hour
delay: canonical publication used resumed wall time, while production build used
the committed observation time. Publication now follows that same committed clock.
Both V7 and V8 assertions first failed and now pass; inventory, metadata and
rollback checks passed 12 tests. Types and focused lint passed.

Ruling: advance the catalog clock through a verified refresh rather than a
private receipt or delayed writer. The pending refresh migration must preserve
its actual observation manifest and Kit support updates.

### Refresh writer migration

Refresh entrypoints now select current immutable operations, then mint an
actions-only dispatch credential. Read-only pinned workers prepare snapshots;
the shared writer validates current identities, schemas and canonical file
digests before publication. Baseline, project and forensic owner requests retain
their existing selection rules and permanent-failure/active-worker guards.

Ruling: observe Kit support and the catalog display clock in one independent
daily refresh operation using the existing worker/writer contracts. A source
provider outage cannot block this operation or unrelated source observations.
The manifest honestly records zero repository scans; source freshness must use
individual source evidence, rather than this display clock. Cost: one additional
bounded operation each day.

Kit observations select the oldest one hundred snapshots, bound pagination to
ten pages and four MiB per response, and retain the existing 128-file prepared
result limit. Provider outages preserve old reaction evidence with stale status;
withdrawn and blocked users remain inactive. Native prepared validation rejects
unrelated files, altered issue identities, future clocks and invented scan counts.

Ruling: cap preparation dispatches at twenty per pass, including explicit
baseline requests. A request for twenty-four sources leaves eligible remainder
for subsequent reconstruction. More than one hundred Kits require additional
daily cycles. These limits trade throughput for bounded unattended work.

Evidence: source-outage isolation first failed, then passed with zero source
provider calls. Eight targeted suites passed 107 checks, with types and focused
lint passing. The first complete integration gate passed 3,250 tests and found
six workflow contracts still expecting the removed direct writer. Updated
contracts and native refresh checks passed 19 tests. A second integration run
exposed eight five-second native/UI timeouts and one subsequent UI failure under
host oversubscription. With test workers bounded to four, all 305 files / 3,256
tests passed in 180.29 seconds; types, lint, formatting and catalog/report gates
also passed. Production build and static export verification passed; the complete
`npm run check` exited zero. No report,
enrichment, maintenance, review or production milestone is implied by this migration.

Ruling: bound unit-test worker concurrency at four — many simultaneous native
Git fixtures and jsdom instances exhausted host resources. Keep behavioral
assertions and timeout deadlines. Cost: a slower full suite on machines capable
of higher concurrency, in exchange for predictable integration checks. Content
deployments continue to run their smaller focused suite.

### Report writer migration

Report requests now select up to twenty current immutable preparations after
installing dependencies, then obtain an actions-only dispatch token. Pinned
read-only workers prepare report data; the shared writer owns canonical
publication and confirmed-deployment incident finalization. Direct rebase/push,
Pages dispatch and recursive importer chains are removed.

Ruling: publish missing verified assessment facts independently from optional
narrative quarantine — provider failures must not delay deterministic policy
output. An owner retry is bound to the current report, synthesis policy and
authenticated numeric owner request. Saved receipts retain the request-run
identity for lookup after it leaves recent workflow inventory. Cost: a removed
request run requires an owner to request the optional retry again.

Narrative preparation uses the existing global model reservation and verified
primary/repair transport. An invalid producer ticket makes zero model HTTP
requests and retains deterministic risk. Successful narrative output still
passes the existing evidence floor, source identity and report validators.
Wholly absent repair configuration is optional; partially configured repair
settings retain strict validation. The existing TavernKeeper integration actor
may request factual imports, while narrative retries require the owner.

Report incidents use current canonical quarantine evidence and numeric bot
custody. Lost creation responses recover the existing issue; unchanged replays
add no comments. Explicit owner dismissal is preserved, and resolution touches
only owned notices. Missing current report-index observation waits instead of
claiming resolution. The existing ten-page lifecycle lookup bound remains;
retention and high-volume integration must address accumulating resolved issue
history before whole-goal completion.

Evidence: owner retry reconstruction, lost incident creation and missing facts
behind quarantine were observed failing, then passing. Nine targeted suites
passed 228 checks; types passed. Native ticket checks demonstrate zero HTTP
requests for invalid custody and one for valid allowance, while deterministic
high-risk output remains unchanged. The complete report integration gate
passed: all 307 files / 3,267 tests in 152.10 seconds, formatting, lint,
palette/catalog/report validation, types, production build and static export
verification. The saved owner-intent adapter regression also passed after a
thirty-day gap. Later migrations, maintenance, review, merge and production
remain required.

### Identity maintenance and Publisher probes

Identity backfill and both Publisher verification workflows are read-only
requests with fresh actions-only dispatch tokens. Canonical writes and branch
custody probes run in the existing shared writer, after dependency setup and
fresh scoped write-token creation. No separate writer framework or operation
kind is introduced.

Identity maintenance reads regular canonical Git objects, applies the existing
healthy-snapshot and immutable-ID checks, validates the projected catalog and
rechecks current main before a non-forced publication. Owner status, refresh
policy and all other fields are preserved. Lost commit responses recover from
the already-filled IDs. Conflicting identities, unknown selections and changed
main produce no write.

Ruling: bound explicit identity maintenance to 256 changed source files per
publication and reject larger selections before writing — this is an owner
maintenance command, not an unattended background rollout. Cost: a large
manual backfill must be split into named selections; no partial success is
reported as completion.

Publisher probes require the actual numeric owner's workflow run, trusted main
origin and fixed request workflow. The main probe publishes a content-neutral
commit and recovers its last empty commit after a lost response. Branch probes
use a reserved zero-issue namespace scoped to the owner request, verify
create/advance/delete, and recover only a branch with their exact marker and
unchanged tree. They cannot submit an ordinary project for publication.

Evidence: missing shared modes, privileged request workflows, branch-probe
support and main-probe replay were observed failing, then passing. Seven
targeted suites passed 131 checks; final types and scoped lint passed. Full CI
for this next checkpoint, remaining manual enrichment, maintenance, independent
review, merge and live production proof are still required.

The identity-maintenance checkpoint `318337254` passed both required GitHub CI
checks in run `37820511122`. A subsequent native Git-adapter regression exposed
an omitted refresh-clock path in the low-level canonical allowlist. The fix
admits only `data/snapshots/github-refresh.json`; regular-file, content-hash,
JSON, size and non-forced main-update checks remain in effect. Four focused
suites passed 30 tests, including publication and verification of the real
clock manifest through the Git adapter. Other enrichment work remains pending.

### Bounded enrichment checkpoint support

The enrichment orchestrator now offers a one-batch checkpoint driver. It yields
after durable progress and waits for confirmed deployment before canary approval
or full-rollout authorization. The existing production workflow is not yet wired
to this driver, so this checkpoint does not claim the rollout migration is done.
The manual CLI forwards its required allowance and guard to the real model
provider, including preflight; a denied allowance makes zero HTTP requests.
The allowance regression was observed failing before the fix. Three focused
provider/CLI/budget suites passed 116 checks; the checkpoint suite passed 34.
Types, scoped lint and whitespace checks passed. Native production routing,
authenticated confirmation and automatic resumption remain required.

### npm dependency maintenance checkpoint

The existing writer now reserves at most one dependency-maintenance slot within
the twenty-operation pass when its authenticated inventory contains Dependabot
PRs. It selects up to twenty oldest bot PRs from that inventory, so older owner
PRs do not hide candidates. It never executes PR code with Publisher credentials.
Native Git reads require regular manifest/lockfile blobs, bounded content and
registry provenance. Script, local-package, range-policy and coupled-version
changes outside the allowed transaction stay manual. Actual numeric Dependabot
custody, allowlisted patch/minor versions, a current base and both trusted
exact-head CI jobs are required. Main and the PR head are read again before the
head-bound GitHub merge request. A stale base with successful checks requests a
branch update and another CI run; failed checks do not repeatedly update it.
The existing deployment controller owns subsequent build and public confirmation.
Missing or rolled-back current production proof prevents another automatic update.

Next.js/ESLint, React/DOM/types and other tooling now have version-update groups.
Security grouping uses GitHub's separate `applies-to: security-updates` option
([official documentation](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates)).
Major and policy-changing updates remain owner decisions. This checkpoint does
not claim automatic Actions-pin maintenance, deduplicated maintenance incidents,
live dependency publication or overall Task 1 completion.

Evidence: missing native adapter, unsafe major eligibility and failed-CI branch
churn were observed failing, then passing. Four focused suites passed 29 checks,
including native Git/CI/merge transport, denied production state, forged custody,
stale checks and exhausted operation allowance. Types and focused lint passed.
The next full CI checkpoint and remaining maintenance scope are still required.

The first accumulated CI run (`37827106280`, head `a49a91ecb`) passed Dependabot
configuration validation and 3,288 unit tests. Its sole failure was the existing
React grouping contract, which still asserted only React/DOM after their type
packages joined the group. The failure reproduced locally; the expectation is
updated to retain all four coupled packages. No implementation gate, timeout or
repository protection is relaxed. The repaired exact head
`c0fc6495114243cfb65e4862d740cf21be3afeaa` passed both required jobs in
[CI run 37827904041](https://github.com/MentallyQuill/Tavernary/actions/runs/37827904041).

### Actions dependency maintenance checkpoint

The same native writer now accepts only pin-line changes in existing regular
workflow files for the seven allowlisted official Actions. It reads each pinned
commit's package version and verifies that the full stable release tag resolves
to that commit, with bounded annotated-tag dereferencing. Generic major-version
comments must agree with the actual package version. The native path reuses the
npm update's bot identity, patch/minor policy, confirmed production, exact-head
CI and fresh-base checks; permission changes and mixed update paths stay manual.

Evidence: the native Actions transaction first returned idle before routing was
connected, then requested exactly one head-bound merge after actual Git tree,
blob and release-reference reads. Adding a contents permission produced zero
PUTs. A moved stable release tag also fails provenance checks. Four focused
suites passed 86 checks; types, scoped lint, formatting and whitespace passed.
This checkpoint does not claim live automatic publication or incident handling.

### Concrete dependency security repair

Next.js and its ESLint configuration are updated together from `16.3.4` to
`16.3.8`, with compatible non-forced transitive lockfile fixes. The official
[stable release](https://github.com/vercel/next.js/releases/tag/v16.3.8) clears
the affected range in the [critical Next.js advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
The native dependency transaction policy accepts the actual manifest/lockfile
diff. A clean install confirms the installed framework is `16.3.8`; build,
static-export verification, types and whole-repository lint pass.

The audit now reports zero critical and five high findings, down from one
critical and eleven high. All remaining findings come from the same development
tool chain: ESLint config/plugin, fast-glob, micromatch and the unpatched
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The audit's
suggested downgrade to ESLint config `14.2.35` would break the coupled framework
policy and is not applied. This remaining upstream issue needs a future compatible
patch or an owner-reviewed tooling change; it is not described as resolved.

The exact security/Actions head `ae422c53579cc32d2c834f0725c0b188d2ee8309`
passed both required jobs in
[CI run 37831400509](https://github.com/MentallyQuill/Tavernary/actions/runs/37831400509).

### Native health and incident checkpoint

The scheduled writer projects individual source observations, due factual
imports, eligible automatic submission progress, ordinary production revision,
known credential/provider failures, allowance exhaustion, repeated unknown
failures and trusted exact-head dependency CI. It reserves at most one incident
mutation within the existing twenty-operation pass. An incident-service failure
preserves the catalog controller result. Fixed reason codes and public identities
exclude raw diagnostics. Stable fingerprints deduplicate notices; absent recovery
proof leaves them open. Fresh issue custody, human closure and owner body edits
are respected. A lost creation response is recovered without another notice or
comments. Provider recovery still requires positive usage proof from the pending
complete model-producer/ledger migration; no successful usage is invented.

Two concrete integration gaps were also reproduced and corrected. The native
refresh adapter now persists a successful unchanged source's observation time
without changing other facts or advancing an unavailable source. This supplies
durable scheduling/health evidence through the existing content publication path.
The actual scheduled writer previously selected closed dependency PRs 1–20 ahead
of open PR 242; it now selects open bot work before reserving its slot. Starting
another worker attempt was also observed prematurely reporting recovery; it now
leaves the stalled notice open until verified publication/completion progress.

Ten focused suites passed 137 checks, including the real scheduled-writer entry,
native issue transport, lost responses, owner decisions, denied allowance,
unchanged-source observations and closed-history selection. Source credentials
are attributed to their actual provider; later healthy, identity-matched source
observations prove recovery. Owner-rejected closed dependency history generates
no new failure alerts. The runbook documents
the focused catalog gate, thresholds and GitHub outage/credential limitations.
This remains a checkpoint: all-provider recovery proof, remaining implementation,
final independent review, exact-head CI, merge and production verification are
still required.
