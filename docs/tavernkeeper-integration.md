# TavernKeeper contextual-scan integration

TavernKeeper is Tavernary's separate, isolated advisory scanner for eligible
GitHub repositories. Tavernary owns catalog eligibility, exact source identity,
the final project-level assessment, and the card experience. TavernKeeper owns
checkout isolation, deterministic scanners, file-centered contextual review,
Technical Report V5, and immutable technical history.

The integration is static and asynchronous. It has no runtime API server,
database, webhook receiver, public scan request, Codeberg scan, or automatic
listing moderation. Production behavior follows the mandatory automation
boundary in [`development-rules.md`](development-rules.md): completed scans and
assessments publish automatically, with no staff approval, dismissal, or manual
recoloring gate.

## What the indicator means

The scan icon states that TavernKeeper scanned one immutable commit and
Tavernary completed an automated contextual assessment of that report. It is
not a guarantee about the repository or a later commit.

Risk and freshness are independent:

- Teal is a `low` final risk. It includes expected behavior, no concerns, and
  minor sensitivities or hardening weaknesses.
- Orange is a `material` final risk: a meaningful potential security weakness
  that does not meet the high-danger floor.
- Red is a `high` final risk: credible malicious behavior or a critical,
  high-confidence, readily exploitable vulnerability.
- Gray means an eligible source has no complete final V5 assessment.
- Dark teal identifies source types TavernKeeper does not support.

A stale assessment keeps its risk color and receives a separate clock marker.
Stale teal remains teal, stale orange remains orange, and stale red remains
red. The panel identifies the exact assessed SHA and explains that a new scan
is pending. If Tavernary cannot confirm the current source SHA, a prior final
assessment remains visible with unavailable freshness; without a prior
assessment the icon remains gray.

The concise card panel shows Tavernary's grade, plain-language summary, finding
counts, scan and assessment dates, freshness, the exact SHA as a source-tree
link, and the full-report link. It does not hydrate technical finding rows or
render the longer `malicious_evidence` statement, which remains part of the
synthesis and data contract. A compact grade-history strip appears only when at
least two assessments exist, alongside the `View scan history` link; a
one-entry history renders neither.
`/security/tavernkeeper/history/{source_id}/` retains every valid Tavernary final
assessment and binds each one to its exact TavernKeeper technical report.

Results never hide, delist, quarantine, rank, or otherwise moderate a listing.

## Public contracts and evidence binding

Tavernary publishes its schema-version-3 target manifest at
`https://tavernary.org/security/tavernkeeper-targets.json`. The checked-in
schema is
[`data/schemas/tavernkeeper-targets.v3.schema.json`](../data/schemas/tavernkeeper-targets.v3.schema.json).
It contains only active, healthy public GitHub sources with a positive immutable
repository ID and a lowercase 40-character target SHA. It contains no command,
clone URL, branch, scan mode, token budget, or requester-controlled workflow
parameter.

Eligibility includes published extension, frontend, and preset cards backed by
a single GitHub repository. TavernKeeper scans the entire exact-SHA repository
for every eligible kind. Non-GitHub URLs, Codeberg sources, and GitHub
organization pages without one immutable repository identity remain
unsupported.

Tavernary accepts only TavernKeeper Preferred Index V5 and Technical Report V5:

- [`data/schemas/tavernkeeper-report-index.v5.schema.json`](../data/schemas/tavernkeeper-report-index.v5.schema.json)
- [`data/schemas/tavernkeeper-scan-report.v5.schema.json`](../data/schemas/tavernkeeper-scan-report.v5.schema.json)

The importer rejects V1-V4. It validates the fixed HTTPS origin, redirect and
payload limits, active Tavernary repository identity, policy version, canonical
immutable URL, body digest, exact SHA, contextual counts, completed scanner and
review coverage, one assessment per candidate, and evidence-bound citations.
Full V5 evidence is consumed by the trusted workflow and never added to the
browser catalog bundle.

Every retained Tavernary final assessment binds the TavernKeeper report ID and
digest, GitHub repository ID and full name, exact SHA, scanner/context/prompt
policy identities, TavernKeeper reviewer identity, Tavernary synthesis model
and policy, final grade, and assessment time. A forced same-SHA rescan creates a
new immutable report and history entry; it does not erase the earlier result.

## Review and synthesis pipeline

TavernKeeper checks out the exact SHA without executing target code. It
inventories the complete tree, runs every required applicable deterministic
scanner, normalizes candidates, and verifies evidence. Each candidate is then
reviewed with bounded file context by TavernKeeper's configured
OpenAI-compatible model. The ecosystem prompt explains that these are
SillyTavern AI community projects, that ordinary extensions legitimately alter
host behavior, and that rare malicious projects have attempted credential
theft, trojan delivery, harmful payloads, and bot infection.

Every candidate must receive one valid contextual disposition, impact,
exploitability, confidence, recommended risk, layman's explanation, developer
action, and evidence citation. Missing context, missing coverage, quota/token
failure, invalid structured output, or provider failure produces no degraded
report.

After importing a complete V5 report, Tavernary's configured Luna provider
synthesizes only the already validated candidates, assessments, observations,
counts, identity, and limitations. It does not rescan source. Its strict JSON
response may cite only the explicit `allowed_candidate_ids` and must copy the
deterministic `required_counts`. Observation IDs are not exposed and are never
valid citations. A rejected response receives only a bounded diagnostic,
allowed or rejected candidate IDs when applicable, and the required counts;
generated prose is never returned as repair context. An identical repair stops
early instead of spending a third request on the same correction.

Tavernary then enforces deterministic floors:

- high-confidence credible malicious behavior is `high`;
- a high-confidence critical readily exploitable vulnerability is `high`;
- a medium-or-higher-confidence material vulnerability is at least `material`;
- expected behavior and minor weaknesses remain in the `low` range.

Luna cannot lower a floor. It can escalate only with a validated interaction
chain citing at least two known findings. A report enters the tracked snapshot
only after its validation, synthesis, floor validation, history merge, and
atomic write succeed. A failed replacement remains absent from preferred
assessments. An older assessment for that repository remains immutable history,
but is not presented as the current preferred result. Independently valid peers
may still commit.

## Handshake and recovery

Tavernary refreshes repository snapshots, validates and deploys the target
manifest, then conditionally wakes TavernKeeper's `reconcile.yml`. TavernKeeper
refetches that public manifest, scans in disposable isolated runners, publishes
sanitized immutable V5 output through its dedicated Publisher App, and wakes
Tavernary's **Security: Reconcile TavernKeeper reports** workflow. Tavernary
imports up to five eligible unseen preferred reports, performs Luna synthesis,
commits the bounded V5 assessment snapshot and import ledger, runs the complete
site check, and dispatches deployment of the exact commit.

Each report import completes independently. Only bounded terminal
`invalid-output` synthesis failures become report-local quarantines. The exact
report digest and synthesis-policy pair is skipped on later scheduled runs, so
it cannot consume the front of every batch. A changed report digest, a synthesis
policy change, or the validated `retry_report_digest` workflow-dispatch input
makes it eligible again. Provider timeout, rate-limit, network, authentication,
configuration, source fetch, schema, digest, and identity failures remain
batch-level failures; they never become report-local quarantine records.

The strict schema-V2 ledger at
`data/security/tavernkeeper-import-state.json` stores only report/repository
identity, exact SHA, policy version, bounded diagnostic, timestamps, and attempt
count. Legacy cooldown rows are migrated without generated output or provider
content. One operational Issue is keyed by SHA-256 of the report digest plus
synthesis policy. It is updated after an invalid explicit retry and closed when
that exact quarantine recovers or becomes obsolete. Issue bodies include only
safe identity fields, the diagnostic, attempt count, and workflow run URL.

The import workflow commits every successful subset plus its updated ledger.
If more eligible imports remain, it dispatches the next bounded batch.
Pages deployment and import continuation are sibling actions: a deployment
failure cannot discard import progress or prevent continuation. A later
TavernKeeper wake or the six-hour schedule discovers new report digests and
also recovers missed wake-ups without retrying unchanged quarantines.

Both directions also reconcile on schedule. Wake calls are non-authoritative:
they carry no target SHA, mode, token budget, priority, or report URL. A missed
wake is repaired by scheduled reconciliation. The Tavernary import workflow
exposes `TAVERNARY_ENRICHMENT_API_URL`, `TAVERNARY_ENRICHMENT_API_KEY`, and
`TAVERNARY_ENRICHMENT_MODEL` only to its synthesis step.

Tavernary staff can run the protected targeted-scan Action with one GitHub URL
already backing an eligible catalog project. The action refreshes and deploys
the authoritative manifest, then sends only the repository ID as a hint.
TavernKeeper refetches the manifest and runs the same automatic production
pipeline.

The two wake directions use separate destination-only GitHub Apps. Neither App
has cross-repository contents-write permission. Installation tokens are opaque,
masked strings; workflows do not parse, log, cache, artifact, or persist their
format or length.

## Scanner isolation and corrections

Target repositories are untrusted data. TavernKeeper never executes their
scripts, hooks, Actions, packages, tests, builds, containers, macros, binaries,
or interpreters. Raw tool output, source excerpts, payloads, secrets, and hidden
model reasoning are not public report content.

There is no per-project false-positive dismissal. If a result exposes a scanner
or assessment-policy defect, staff correct the global versioned policy through
ordinary code review and automatically rescan affected targets. If a project
changes its code, staff may force a normal rescan; a new complete report and
automated Tavernary assessment can become preferred without rewriting history.
