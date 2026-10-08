# Tavernary unattended-operation overhaul

Date: 2026-10-07
Status: proposed specification for user review
Production baseline: `a7139759edfb253bfeb43e6196ff00a7c7f07eb3`
Working branch: `codex/tavernary-longevity`

## Intent and scope decisions

The intended outcome is years of useful, current catalog operation with
exceptional owner intervention and minimal routine developer maintenance.
Preserve the static Next.js export, GitHub Pages, canonical versioned catalog,
creator-hosted projects, immutable repository identities, and existing
publication authority checks.

The user explicitly narrowed infrastructure to GitHub only on 2026-10-07:
"Let's remove the features for those. I only want to use Github".
External watchdogs and off-site backups are removed from the scope. Use
GitHub Actions, issues, pull requests, repository configuration, artifacts,
and retained deployment bundles. Existing source and model providers remain
inputs; no new hosting, database, monitoring, or backup account is introduced.

GitHub-only operation cannot observe or repair a complete GitHub outage from
outside GitHub. When Actions resumes, reconciliation must repair missed work.
Domain renewal, billing, account recovery, private-key replacement, and
exceptional policy decisions remain owner responsibilities.

Automatic discovery of previously unknown projects is conditional in the goal
and has not been selected. This overhaul maintains submitted and registered
projects. It must not add an unrestricted crawler or silently expand admission
policy. A separately verified, bounded candidate queue requires a later
explicit discovery decision.

## Current evidence and constraints

Inspection of the baseline identifies these extension points:

- `scripts/submissions/project-validation-reconciliation.mjs` retries exact
  generated heads, but counts cancelled and skipped conclusions among failed
  attempts and blocks after three failures.
- `reconcile-project-validations.yml` reconstructs some project work every
  fifteen minutes. Missing intake, incomplete generation, Kits, advisory work,
  deployment, and confirmation need equivalent coverage.
- Refresh, enrichment, Kit publication, report import, project merge, and
  advisory workflows use different concurrency groups while writing to
  `main`. Refresh and imports can request deployment in addition to the push
  event triggered by their Publisher App token.
- Advisory dispatches share one default pending concurrency slot. Jobs dropped
  before writing an advisory state cannot be recovered by scanning only
  `review-unavailable` files.
- `deploy-pages.yml` aborts on most failures reading the old hosted target
  manifest before publishing a new artifact.
- Report import already publishes deterministic assessments when optional
  narrative synthesis fails. Preserve this behavior.
- Full metadata enrichment is manually dispatched. Existing provider budgets,
  manual-field policies, durable rollout state, identity checks, and source
  snapshots are reusable.
- Dependabot creates updates, but completion depends on someone addressing
  checks and merging. Node 24 is the only declared runtime.
- Existing rulesets protect main and Publisher-owned automation branches.
  Full CI includes content validation, unit checks, static export verification,
  browser checks, and Windows visual checks.

No existing rule may be weakened merely to make automation or CI pass.
A missing check, ambiguous authority, untrusted artifact, or unsupported
contract is never equivalent to success.

## Architecture

### Durable operations and authoritative reconstruction

Introduce shared operation contracts and planners under
`scripts/automation/`, following the repository's existing testable
`.mjs` modules with matching declaration files. Keep workflow YAML as
adapters; move state decisions out of large inline shell and JavaScript blocks.

An operation contains a schema version, kind, immutable key, source identity,
normalized input digest, relevant policy version, expected revision,
stage, current worker run, retry classification, next eligible time, and a
sanitized diagnostic. Keys are derived from the work's identity and evidence,
not a timestamp or workflow run number.

The main-branch reconciler discovers work from current issues, PRs, canonical
records, source/evidence fingerprints, deployed revision, and known workflow
runs. Paginate inventories. Workflow events request an earlier reconciliation
pass; they are not the only durable record that work exists.

Record meaningful progress in validated
`data/maintenance/automation/` receipts and bot-owned issue markers. Do not
commit a new heartbeat every polling interval. If a receipt is missing,
reconstruct the operation from authoritative state. A lost or malformed
receipt must not permit duplicate publication or broaden authority.

Stages are discovered, admitted, generated, validated, published, deployment
requested, deployment confirmed, and finalized. Optional enrichment and
advisory stages have separate progress so they cannot obscure core publication.
A merge is canonical publication; public availability and issue bookkeeping
are separate confirmations.

Reconcile project submissions, owner requests, Kits, withdrawals, source
refresh, scan report import, metadata enrichment, advisory review, deployment,
and final notices. Intentional human-review states remain visible exceptions.
Manual publication mode remains manual. Unverified reports cannot automatically
retire a listing, change policy, or claim owner authority.

Use a fifteen-minute scheduled pass and event wakes. Default to twenty
operations per pass, with stable oldest-eligible ordering and bounded provider
work. Persist cursors where necessary, and schedule continuation only when
progress is possible. Do not create a self-dispatch loop while dependencies
are unavailable. A busy item must not starve unrelated sources.

### Failure classification and recovery

Classify results using structured diagnostic evidence:

| Classification | Examples | Behavior |
| --- | --- | --- |
| Superseded | Input or head changed, duplicate event, old deployment request | Recompute current operation; acknowledge old work safely |
| Transient infrastructure | Cancellation, provider timeout, HTTP 429/5xx, network failure, mergeability delay, temporary runner failure | Back off and resume automatically |
| Configuration unavailable | Missing provider configuration, invalid credential, exhausted spending allowance | Open the affected dependency circuit; probe on a bounded schedule |
| Permanent input or policy failure | Invalid manifest, unsupported source, lost owner authority, path violation, deterministic validation failure | Stop mutation for that input; preserve a clear corrective state |
| Unknown failure | Insufficient evidence to distinguish code failure from infrastructure | Bounded retries, then an actionable incident and dependency probe; never infer validation success |

Use five minutes, fifteen minutes, one hour, six hours, then twenty-four hours
as default transient delays, with bounded jitter and Retry-After support.
Cap three immediate attempts in a worker; this cap must not permanently exhaust
a valid operation during a multi-day outage. Repeated deterministic failure
for unchanged input stops that item. Input or policy changes create a fresh
decision while preserving history.

Cancelled, skipped, or superseded runs consume no permanent validation-failure
allowance. A workflow's `failure` conclusion alone does not prove content is
invalid. Preserve exact-head validation and recheck mutable authority before
every publication attempt.

Acquire Publisher App tokens near the authorized write or dispatch. Split
long-running preparation from publication and refresh tokens when necessary;
a five-hour rollout cannot rely on an installation token minted at its start.
Circuit probes must not retry every queued item against the same broken
credential.

### Publication coordination

Use one serialized canonical write lane. Data acquisition and immutable
preparation may run concurrently; authoritative merges and canonical snapshot
writes share the lane.

Workers provide allowlisted, schema-validated results tied to immutable source
identity, input/evidence fingerprint, producing workflow, run ID, and base
revision. The writer accepts only trusted in-repository producers, validates
artifact contents and paths, rechecks current state, and either applies the
result, regenerates stale work, or rejects it. Never execute code supplied by a
submission or downloaded artifact.

Project and owner transactions retain exact validated head SHA, actor
identity, bot custody, base-drift checks, input digest, path allowlist,
tombstones, and the emergency auto-publication switch. Kit operations retain
their manifest and author checks. Snapshot/advisory commits use the same
bounded, verified writer rather than independent push loops.

Combine compatible snapshot updates and regenerate public catalog assets once
for each publication batch. Repeated delivery of an operation is a no-op.
Only the coordinator requests ordinary deployment, using the published commit
and relevant artifact digest. User pushes are discovered by the same deploy
planner so they do not need a second competing publishing path.

GitHub concurrency limits execution, while durable reconstruction preserves
work beyond the queue's capacity. Larger queues may reduce dropped requests,
but no correctness property depends on every dispatch starting.

### Deployment, confirmation, and rollback

Build from an exact trusted main-branch revision. Validate the catalog and
static export before deployment. Reading the previously hosted manifest is
advisory: timeout, unavailable hosting, or a missing previous manifest must not
block a valid recovery artifact. Verification of the new artifact remains
mandatory.

Embed a public revision manifest containing source SHA, catalog schema and
digest, target-manifest digest, build identifier, and artifact integrity
metadata. Keep revision metadata separate from the catalog's semantic digest
so a heartbeat does not force catalog rebuilds.

At the final serialized deployment step, reread authoritative deployment state.
A stale ordinary request is satisfied by an already confirmed descendant
deployment, or superseded by the newest eligible validated revision. An older
main ancestor must not replace a newer successful deployment. An explicit
trusted rollback is a separate operation, with reason and authorization.

After Pages reports success, poll for the expected revision and matching
catalog/target digests. Run bounded public browser smoke checks for catalog
loading and search, a project source link, Kits, and submission/help navigation.
Transient propagation delays retry confirmation; they must not cause duplicate
canonical merges. Finalization records actual confirmation rather than merely
a successful workflow dispatch.

Retain complete successful site bundles and integrity manifests within GitHub.
Use ninety-day Actions artifact retention, keep the latest three verified
bundles, and retain twelve monthly verified bundles as GitHub release assets.
Prune only after verifying replacement assets and excluding a pending restore
or rollback target.

A rollback must not re-expose an owner-delisted source or overwrite newer
canonical owner decisions. Permit automatic rollback only when compatibility
and current canonical data safety are proven. Otherwise preserve the last
working site, record the failed release, and require an explicit owner decision.
Never weaken admission or security checks to recover availability.

### GitHub-only operational checks

The reconciler produces sanitized run summaries and deduplicated maintenance
issues for persistent incidents. Check queue progress, deployed revision,
catalog freshness, scan import progress, provider circuits, token availability,
remaining work, and spending allowance.

Use initial warning thresholds of forty-eight hours for daily source refresh,
twenty-four hours for a due scan import, and two hours for an automatically
eligible submission with no progress. These are operational targets for
healthy GitHub/provider conditions, not promises of real-time scheduling.
Distinguish intentional owner/manual waits from stalled automation.

Keep one incident per dependency or operation fingerprint. Update material
changes and close only after evidence of recovery. Never write credentials,
untrusted full provider responses, or private evidence to issues or public
artifacts. Document recovery after disabled schedules or GitHub inactivity;
no external watchdog or off-site backup is included.

### Optional AI and scheduled metadata maintenance

Protect manual summary and tag policies independently. Refresh verified facts
without requiring model output. Keep existing trusted summaries and tags when
a provider is unavailable or an output fails contract validation.

Store normalized source-content fingerprints and editorial policy/vocabulary
versions. Enqueue automatic fields when relevant evidence changes or a previous
attempt remains pending. Prioritize changed records over unchanged periodic
work. Use bounded scheduled batches of ten sources and concurrency two, with
cross-workflow request/token accounting and cached validated results.

For newly admitted records, use contract-valid factual provisional copy from
verified source evidence when editorial AI is unavailable. Clearly identify
pending enrichment. Do not invent descriptions, classifications, scan
clearance, or endorsements. If required verified facts are missing, retain a
recoverable pending intake operation.

Set default scheduled limits of forty model requests per day and two hundred
thousand total requested tokens per day across primary and repair roles.
Reserve allowance before dispatch, count retries and repairs, and avoid races
between workflows. Configured model prices and an optional monthly USD ceiling
can further reduce the allowance; prices must match the actual approved model.
If price-based accounting is requested but no trustworthy price is configured,
pause model work and retain deterministic operation. Existing manual rollouts
must also obey configured global ceilings.

TavernKeeper deterministic policy owns the assessment. Optional narrative
enrichment cannot downgrade warnings, conceal missing evidence, or block import
of valid reports. Existing stale/evidence distinctions must be preserved.

Public catalog contracts and Companion compatibility remain supported. Put
operational metadata in sidecars where possible. A required public schema
change must use an explicit versioned migration and compatibility tests.

### Dependency and runtime maintenance

Group Next.js with its ESLint configuration, React with React DOM, and compatible
test/tooling updates. Keep the committed lockfile and pinned Actions revisions.
Authenticate dependency automation and validate update metadata, source,
changed-path allowlist, and exact checked head before merge.

Auto-merge eligible allowlisted patch/minor dependency transactions only after
the required complete checks, browser coverage, and build pass. Major dependency
updates and permission/workflow-policy changes remain explicit owner decisions.
A failed update keeps the functioning release and creates one actionable
maintenance incident; it must not stop unrelated catalog operations.

Maintain a supported-runtime manifest and scheduled compatibility checks
against the current supported LTS and the next stable LTS candidate. A runtime
transition changes engines, workflow setup, declarations, and documentation
together after full verification. Select supported releases using the official
Node release schedule hosted on GitHub, not arbitrary model recommendations.
Do not silently remain on an end-of-life runtime. Alert with sufficient lead
time if a tested transition is unavailable.

Use retained successful artifacts for recovery and perform post-deployment
checks after automatic dependency publication. No dependency automation may
execute untrusted PR code with Publisher secrets.

### Retention and recovery drills

Keep pending operations until resolved or intentionally rejected. Retain full
terminal receipts for ninety days, then prune detailed state only when
canonical records/merged PRs and confirmed deployment provide durable
idempotency evidence. Preserve owner-delist tombstones.

Run a weekly GitHub-hosted restore drill against a retained verified site bundle:
download, validate integrity, serve in an isolated workspace, run browser smoke,
and prove required source/catalog/target identities. Do not deploy the drill or
modify live listings. A drill must restore without enrichment provider access.
No independent repository backup service is added.

## Delivery boundaries

Deliver in reviewable stages while preserving the complete goal:

1. Shared failure contracts, retry classification, current controller fixes,
   token lifecycle handling, and interruption tests.
2. Durable reconstruction across eligible intake, generation, Kits, owner
   requests, enrichment/advisory work, and finalization.
3. Serialized canonical publication, deployment deduplication, monotonic
   revision checks, outage recovery, confirmation, retained bundles, and rollback.
4. Scheduled metadata maintenance, deterministic fallbacks, fingerprint caching,
   provider circuits, and global budgets.
5. Gated dependency completion, runtime transition checks, GitHub operational
   incidents, retention, and restore drills.
6. Integration verification, owner runbook, live deployment checks, and a
   requirement-by-requirement completion audit.

Stage boundaries organize the work; an early PR is not completion of the goal.
Existing authority, schema, and consumer compatibility tests remain gates.
All implemented stages must be submitted in attached PRs, pass required CI,
resolve review/merge conflicts, merge, and receive appropriate production
verification.

## Acceptance and completion evidence

| ID | Requirement | Required evidence |
| --- | --- | --- |
| R1 | Current production base; preserve user changes | Isolated worktree baseline and separate original-checkout status |
| R2 | Recover missed admission, generation, validation, publication, deployment, and finalization | Integration cases deleting each event/receipt and a trusted canary through all eligible stages |
| R3 | Recover eligible Kits and owner requests; respect manual decisions | Authenticated fixture flows, replay/no-op cases, manual-mode denial cases |
| R4 | Survive cancellations and a simulated seventy-two-hour provider outage | Injected clock and provider recovery tests; resumed work without permanent transient exhaustion |
| R5 | Preserve exact-head, immutable identity, authority, tombstone, and path invariants | Existing and new adversarial publication tests; ruleset inspection |
| R6 | Serialize canonical changes and avoid duplicate writes/deploys | Concurrent/replayed result tests; coordinator traces with one canonical result |
| R7 | Prevent ordinary deployment regression | Out-of-order revision/ancestry tests and stale-request canary |
| R8 | Recover deployment when old hosting/manifest read fails | Public-manifest outage injection with a valid recovery artifact |
| R9 | Confirm real deployed artifact and essential browser behavior | Expected public revision/digests and browser smoke output |
| R10 | Retain restorable GitHub bundles; support authorized safe rollback | Verified assets, integrity checks, rollback data-safety tests, clean restore drill |
| R11 | GitHub-only operational checks and bounded incident handling | Stale-progress/provider/budget scenarios; incident deduplication and recovery evidence |
| R12 | Preserve trusted fields and deterministic scans during model outages | Provider-failure cases, manual-policy tests, provisional-copy and assessment contracts |
| R13 | Maintain changed metadata automatically with bounded budgets and cache | Scheduled selector tests, unchanged-source no-call cases, concurrent budget and repair accounting |
| R14 | Complete eligible dependency maintenance safely | Trusted update transaction tests, full CI, exact-head merge evidence, post-deploy verification |
| R15 | Tested supported-runtime upgrade policy | Supported manifest, full compatibility checks, end-of-life warning and transition cases |
| R16 | Bound state and artifact retention without losing active work | Retention boundary tests, pending-operation preservation, protected restore target tests |
| R17 | Actionable owner runbook | Documented recovery commands, switches, credential repair, manual exceptions, restore/rollback, and GitHub-only limitations |
| R18 | PR, CI, review, merge, and production completion | Attached PR URLs, passing required checks at merged heads, resolved feedback, merged states, deployed revisions, and final audit |

Before completion, inspect every row against current authoritative evidence.
A green narrow unit suite, a queued deployment, an opened PR, or a successful
merge alone is insufficient. Missing evidence remains unfinished work.
